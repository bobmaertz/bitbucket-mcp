import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { BitbucketAPI } from '@bobmaertz/bitbucket-api';
import {
  getPullRequestDiffstat,
  listPullRequestStatuses,
  listCommitStatuses,
  getPullRequestActivity,
  listCommitPullRequests,
  getTestReports,
} from './operations.js';

/**
 * Hermetic integration test for the Phase 3 PR/CI-depth operations, exercising
 * the composed test-report summary (report + cases + per-case reasons) end to
 * end over the real axios + presenter stack.
 */
describe('phase 3 operations (HTTP integration)', () => {
  let server: http.Server;
  let baseURL: string;
  const requestedPaths: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '';
      requestedPaths.push(url);
      const jsonRes = (body: unknown): void => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      if (url.includes('/pullrequests/42/diffstat')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 25,
          values: [
            {
              type: 'diffstat',
              status: 'modified',
              lines_added: 5,
              lines_removed: 2,
              new: { path: 'src/a.ts' },
              old: { path: 'src/a.ts' },
            },
          ],
        });
        return;
      }

      if (url.includes('/pullrequests/42/statuses') || url.includes('/commit/abc123/statuses')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 25,
          values: [
            {
              key: 'build-1',
              name: 'CI',
              state: 'FAILED',
              url: 'https://ci.example.com/1',
              commit: { hash: 'deadbeefcafe0000' },
              updated_on: '2026-07-01T10:00:00Z',
              type: 'build',
            },
          ],
        });
        return;
      }

      if (url.includes('/pullrequests/42/activity')) {
        jsonRes({
          size: 2,
          page: 1,
          pagelen: 25,
          values: [
            { approval: { date: '2026-07-01T10:00:00Z', user: { display_name: 'Grace' } } },
            {
              comment: {
                user: { display_name: 'Ada' },
                created_on: '2026-07-01T11:00:00Z',
                content: { raw: 'nit' },
              },
            },
          ],
        });
        return;
      }

      if (url.includes('/commit/abc123/pullrequests')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 25,
          values: [
            {
              id: 42,
              title: 'Add widget',
              state: 'MERGED',
              author: { display_name: 'Ada' },
              source: { branch: { name: 'feat/w' } },
              destination: { branch: { name: 'main' } },
              links: { html: { href: 'https://bitbucket.org/acme/repo/pull-requests/42' } },
            },
          ],
        });
        return;
      }

      // Test reports: reasons → cases → summary (order matters).
      if (url.includes('/test_case_reasons')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 100,
          values: [{ message: 'expected 1 but got 2' }],
        });
        return;
      }
      if (url.includes('/test_reports/test_cases')) {
        jsonRes({
          size: 3,
          page: 1,
          pagelen: 100,
          values: [
            {
              uuid: '{c1}',
              fully_qualified_name: 'FooTest.a',
              status: 'PASSED',
              duration_in_ms: 3,
            },
            {
              uuid: '{c2}',
              fully_qualified_name: 'FooTest.b',
              status: 'FAILED',
              duration_in_ms: 5,
            },
            { uuid: '{c3}', fully_qualified_name: 'FooTest.c', status: 'ERROR', duration_in_ms: 1 },
          ],
        });
        return;
      }
      if (url.includes('/test_reports')) {
        jsonRes({
          uuid: '{r}',
          total_test_count: 3,
          passed_test_count: 1,
          failed_test_count: 1,
          error_test_count: 1,
          skipped_test_count: 0,
          type: 'report',
        });
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
    return new BitbucketAPI({ email: 'u@x.io', apiToken: 't', baseURL, retryBaseDelayMs: 0 });
  }

  it('gets a PR diffstat', async () => {
    const page = await getPullRequestDiffstat(api(), { workspace: 'acme', repo: 'repo', id: 42 });
    expect(page.items[0]).toEqual({
      status: 'modified',
      path: 'src/a.ts',
      lines_added: 5,
      lines_removed: 2,
    });
  });

  it('lists PR statuses', async () => {
    const page = await listPullRequestStatuses(api(), { workspace: 'acme', repo: 'repo', id: 42 });
    expect(page.items[0]).toMatchObject({ key: 'build-1', state: 'FAILED', name: 'CI' });
  });

  it('lists commit statuses', async () => {
    const page = await listCommitStatuses(api(), {
      workspace: 'acme',
      repo: 'repo',
      commit: 'abc123',
    });
    expect(page.items[0]).toMatchObject({ key: 'build-1', state: 'FAILED' });
  });

  it('normalizes PR activity entries by kind', async () => {
    const page = await getPullRequestActivity(api(), { workspace: 'acme', repo: 'repo', id: 42 });
    expect(page.items).toEqual([
      { kind: 'approval', user: 'Grace', date: '2026-07-01T10:00:00Z' },
      { kind: 'comment', user: 'Ada', date: '2026-07-01T11:00:00Z', content: 'nit' },
    ]);
  });

  it('lists the PRs containing a commit', async () => {
    const page = await listCommitPullRequests(api(), {
      workspace: 'acme',
      repo: 'repo',
      commit: 'abc123',
    });
    expect(page.items[0]).toMatchObject({ id: 42, title: 'Add widget', state: 'MERGED' });
  });

  it('summarizes a test report with failing cases and their reasons', async () => {
    const result = await getTestReports(api(), {
      workspace: 'acme',
      repo: 'repo',
      pipeline: '7',
      step: '{s}',
    });
    expect(result.summary).toEqual({ total: 3, passed: 1, failed: 1, error: 1, skipped: 0 });
    // Only the FAILED and ERROR cases are surfaced, each with its reason text.
    expect(result.failing).toEqual([
      { name: 'FooTest.b', status: 'FAILED', duration_ms: 5, reasons: 'expected 1 but got 2' },
      { name: 'FooTest.c', status: 'ERROR', duration_ms: 1, reasons: 'expected 1 but got 2' },
    ]);
    expect(result.reasons_truncated).toBeUndefined();
  });
});
