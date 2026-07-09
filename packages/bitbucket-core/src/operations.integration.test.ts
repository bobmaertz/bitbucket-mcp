import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { BitbucketAPI } from '@bobmaertz/bitbucket-api';
import {
  listPullRequests,
  listUserPullRequests,
  getPullRequestDiff,
  getStepLog,
  listBranches,
  listRepositories,
} from './operations.js';

/**
 * Hermetic integration test: a real local HTTP server stands in for Bitbucket
 * so the full axios + auth + retry + pagination + presenter stack is exercised
 * (not mocked at the function boundary).
 */
describe('operations (HTTP integration)', () => {
  let server: http.Server;
  let baseURL: string;
  let prHits = 0;
  let lastAuthHeader: string | undefined;
  let lastBranchesUrl: string | undefined;
  let lastDiffUrl: string | undefined;
  let lastLogRange: string | undefined;
  const requestedPaths: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      lastAuthHeader = req.headers.authorization;
      const url = req.url ?? '';
      requestedPaths.push(url);

      // Workspace-scoped repository listing: `/repositories/acme` with no repo
      // segment (distinct from `/repositories/acme/repo/...` handled below).
      if (url.startsWith('/repositories/acme?') || url === '/repositories/acme') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            size: 1,
            page: 1,
            pagelen: 25,
            values: [{ full_name: 'acme/widgets', is_private: true, links: {} }],
          })
        );
        return;
      }

      if (url.startsWith('/repositories/acme/repo/pullrequests') && !url.includes('/diff')) {
        prHits++;
        // Fail once with 429 to exercise retry/backoff, then succeed.
        if (prHits === 1) {
          res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' });
          res.end(JSON.stringify({ error: { message: 'slow down' } }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            size: 1,
            page: 1,
            pagelen: 25,
            next: `${baseURL}/repositories/acme/repo/pullrequests?page=2`,
            values: [
              {
                id: 42,
                title: 'Add feature',
                state: 'OPEN',
                author: { display_name: 'Jo' },
                source: { branch: { name: 'feature/x' } },
                destination: { branch: { name: 'main' } },
                comment_count: 2,
                task_count: 0,
                updated_on: '2026-01-01T00:00:00Z',
                links: { html: { href: 'https://bitbucket.org/acme/repo/pull-requests/42' } },
              },
            ],
          })
        );
        return;
      }

      if (url.includes('/pullrequests/42/diff')) {
        lastDiffUrl = url;
        const diff = [
          'diff --git a/x b/x',
          ...Array.from({ length: 500 }, (_, i) => `+line ${i}`),
        ].join('\n');
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(diff);
        return;
      }

      // Pipeline step log: a 2000-byte body that honors a suffix Range request
      // (`bytes=-N`) with a 206 + Content-Range so the Range/tail path is
      // exercised over the real axios stack.
      if (url.includes('/pipelines/7/steps/') && url.endsWith('/log')) {
        const full = Array.from({ length: 100 }, (_, i) => `log line ${i}`).join('\n');
        const totalBytes = Buffer.byteLength(full, 'utf8');
        const range = req.headers.range;
        lastLogRange = range;
        const suffix = range?.match(/^bytes=-(\d+)$/);
        if (suffix) {
          const n = Math.min(Number(suffix[1]), totalBytes);
          const slice = Buffer.from(full, 'utf8').subarray(totalBytes - n);
          res.writeHead(206, {
            'content-type': 'application/octet-stream',
            'content-range': `bytes ${totalBytes - n}-${totalBytes - 1}/${totalBytes}`,
          });
          res.end(slice);
          return;
        }
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(totalBytes),
        });
        res.end(full);
        return;
      }

      // Authenticated user lookup, used to resolve "my" PRs to a selected_user.
      if (url === '/user') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ account_id: 'acc-1', uuid: '{me}', display_name: 'Jo', type: 'user' })
        );
        return;
      }

      // Workspace-scoped PRs authored by a user — two pages to exercise the
      // opaque-cursor aggregation across the real axios stack.
      if (url.startsWith('/workspaces/acme/pullrequests/')) {
        const onPageTwo = url.includes('page=2');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            size: 2,
            values: [
              {
                id: onPageTwo ? 43 : 42,
                title: onPageTwo ? 'Second' : 'First',
                state: 'OPEN',
                author: { display_name: 'Jo' },
                source: { branch: { name: 'feature/x' } },
                destination: {
                  branch: { name: 'main' },
                  repository: { full_name: onPageTwo ? 'acme/gadgets' : 'acme/widgets' },
                },
                comment_count: 0,
                task_count: 0,
                updated_on: '2026-01-01T00:00:00Z',
              },
            ],
            next: onPageTwo ? undefined : `${baseURL}/workspaces/acme/pullrequests/acc-1?page=2`,
          })
        );
        return;
      }

      if (url.startsWith('/repositories/acme/repo/refs/branches')) {
        lastBranchesUrl = url;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            size: 1,
            page: 1,
            pagelen: 25,
            values: [
              {
                name: 'main',
                target: {
                  hash: '0123456789abcdef0123456789abcdef01234567',
                  date: '2026-01-01T00:00:00Z',
                  author: { display_name: 'Jo' },
                  message: 'init',
                },
              },
            ],
          })
        );
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseURL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function api(): BitbucketAPI {
    return new BitbucketAPI({
      email: 'user@example.com',
      apiToken: 'token123',
      baseURL,
      retryBaseDelayMs: 0,
    });
  }

  it('lists PRs end to end, retrying the 429 and presenting lean fields', async () => {
    const page = await listPullRequests(api(), { workspace: 'acme', repo: 'repo' });
    expect(prHits).toBeGreaterThanOrEqual(2); // proves the retry happened
    expect(page.has_more).toBe(true);
    expect(page.items[0]).toEqual({
      id: 42,
      title: 'Add feature',
      state: 'OPEN',
      author: 'Jo',
      source_branch: 'feature/x',
      dest_branch: 'main',
      comment_count: 2,
      task_count: 0,
      updated_on: '2026-01-01T00:00:00Z',
      url: 'https://bitbucket.org/acme/repo/pull-requests/42',
    });
  });

  it('sends Basic auth derived from email:token', () => {
    const expected = 'Basic ' + Buffer.from('user@example.com:token123').toString('base64');
    expect(lastAuthHeader).toBe(expected);
  });

  it('caps a large diff and reports files changed', async () => {
    const result = await getPullRequestDiff(api(), {
      workspace: 'acme',
      repo: 'repo',
      id: 42,
      maxLines: 50,
    });
    expect(result.truncated).toBe(true);
    expect(result.total_lines).toBeGreaterThan(50);
    expect(result.diff.split('\n')).toHaveLength(50);
    expect(result.files_changed).toBe(1);
  });

  it('lists a workspace’s repos via /repositories/{workspace}, not the retired /workspaces', async () => {
    requestedPaths.length = 0;
    const result = await listRepositories(api(), { workspace: 'acme' });

    expect(result.repos[0]).toMatchObject({ full_name: 'acme/widgets', workspace: 'acme' });
    // CHANGE-2770 regression: the retired workspace-listing endpoints must
    // never be hit; every request stays under /repositories/{workspace}.
    expect(requestedPaths.some((p) => p.startsWith('/repositories/acme'))).toBe(true);
    expect(requestedPaths.some((p) => p === '/workspaces' || p.startsWith('/workspaces?'))).toBe(
      false
    );
    expect(requestedPaths.some((p) => p.startsWith('/user/workspaces'))).toBe(false);
  });

  it('aggregates a user’s workspace PRs across pages, resolving "me" and tagging repos', async () => {
    requestedPaths.length = 0;
    const result = await listUserPullRequests(api(), { workspace: 'acme' });

    // Followed the opaque cursor to page 2, so both repos' PRs are present.
    expect(result.pages_fetched).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.has_more).toBe(false);
    expect(result.items.map((i) => i.repo)).toEqual(['acme/widgets', 'acme/gadgets']);

    // Resolved the authenticated account and hit the workspace-user endpoint.
    expect(requestedPaths).toContain('/user');
    expect(requestedPaths.some((p) => p.startsWith('/workspaces/acme/pullrequests/acc-1'))).toBe(
      true
    );
  });

  it('reports truncation when the max_pages cap is hit before exhausting results', async () => {
    const result = await listUserPullRequests(api(), { workspace: 'acme', maxPages: 1 });
    expect(result.pages_fetched).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.has_more).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('shortens branch hashes', async () => {
    const page = await listBranches(api(), { workspace: 'acme', repo: 'repo' });
    expect(page.items[0]).toMatchObject({ name: 'main', target_hash: '0123456789ab' });
  });

  it('clamps an oversized pagelen to the 100 max before hitting the API', async () => {
    await listBranches(api(), { workspace: 'acme', repo: 'repo', pagelen: 9999 });
    expect(lastBranchesUrl).toContain('pagelen=100');
    expect(lastBranchesUrl).not.toContain('9999');
  });

  it('requests server-side partial responses via the fields param', async () => {
    await listBranches(api(), { workspace: 'acme', repo: 'repo' });
    // Branches list asks Bitbucket to trim to just the presented paths, and
    // keeps the envelope keys pagination/total need.
    expect(lastBranchesUrl).toContain('fields=');
    const fields = decodeURIComponent(
      new URL(baseURL + lastBranchesUrl!).searchParams.get('fields')!
    );
    expect(fields).toContain('values.name');
    expect(fields).toContain('values.target.hash');
    expect(fields).toContain('next');
    expect(fields).toContain('size');
  });

  it('scopes a PR diff to a path with reduced context server-side', async () => {
    await getPullRequestDiff(api(), {
      workspace: 'acme',
      repo: 'repo',
      id: 42,
      path: 'src/a.ts',
      context: 0,
    });
    const params = new URL(baseURL + lastDiffUrl!).searchParams;
    expect(params.get('path')).toBe('src/a.ts');
    expect(params.get('context')).toBe('0');
  });

  it('tails a step log via a suffix Range instead of downloading it whole', async () => {
    const result = await getStepLog(api(), {
      workspace: 'acme',
      repo: 'repo',
      pipeline: '7',
      step: '{s}',
      maxBytes: 128,
    });
    // Sent a suffix Range and got a 206 back, so total_bytes reflects the full
    // log while only the tail slice was transferred.
    expect(lastLogRange).toBe('bytes=-128');
    expect(result.truncated).toBe(true);
    expect(result.total_bytes).toBeGreaterThan(128);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('fetches the whole step log when grepping (Range would hide earlier matches)', async () => {
    lastLogRange = 'sentinel';
    const result = await getStepLog(api(), {
      workspace: 'acme',
      repo: 'repo',
      pipeline: '7',
      step: '{s}',
      grep: 'log line 3',
    });
    // No Range header on the grep path.
    expect(lastLogRange).toBeUndefined();
    expect(result.text.split('\n').every((l) => l.includes('log line 3'))).toBe(true);
  });
});

/**
 * Opt-in live contract test against the real Bitbucket API. Skipped unless
 * BITBUCKET_E2E=1 and credentials + a target repo are provided.
 */
const live = process.env.BITBUCKET_E2E === '1' ? describe : describe.skip;
live('operations (live Bitbucket)', () => {
  it('lists open PRs for the configured repo', async () => {
    const api = new BitbucketAPI({
      email: process.env.BITBUCKET_EMAIL!,
      apiToken: process.env.BITBUCKET_API_TOKEN!,
    });
    const page = await listPullRequests(api, {
      workspace: process.env.BITBUCKET_WORKSPACE!,
      repo: process.env.BITBUCKET_E2E_REPO!,
    });
    expect(Array.isArray(page.items)).toBe(true);
  });
});
