import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { BitbucketAPI } from 'bitbucket-api';
import { listPullRequests, getPullRequestDiff, listBranches } from './operations.js';

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

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      lastAuthHeader = req.headers.authorization;
      const url = req.url ?? '';

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
        const diff = [
          'diff --git a/x b/x',
          ...Array.from({ length: 500 }, (_, i) => `+line ${i}`),
        ].join('\n');
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(diff);
        return;
      }

      if (url.startsWith('/repositories/acme/repo/refs/branches')) {
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

  it('shortens branch hashes', async () => {
    const page = await listBranches(api(), { workspace: 'acme', repo: 'repo' });
    expect(page.items[0]).toMatchObject({ name: 'main', target_hash: '0123456789ab' });
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
