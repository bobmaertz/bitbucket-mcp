import { describe, it, expect, vi } from 'vitest';
import type { BitbucketAPI } from 'bitbucket-api';
import { createLogger } from 'bitbucket-core';
import { readOnlyTools, handlers, type ToolContext } from './tools.js';

describe('read-only tool surface', () => {
  const names = readOnlyTools.map((t) => t.name);

  it('exposes exactly the expected read tools', () => {
    expect(names.sort()).toEqual(
      [
        'bitbucket_get_branch',
        'bitbucket_get_comment',
        'bitbucket_get_pr_commits',
        'bitbucket_get_pr_diff',
        'bitbucket_get_pull_request',
        'bitbucket_get_task',
        'bitbucket_list_branches',
        'bitbucket_list_pr_comments',
        'bitbucket_list_pr_tasks',
        'bitbucket_list_pull_requests',
      ].sort()
    );
  });

  it('exposes no write/mutation tools', () => {
    const forbidden = /(create|update|delete|merge|approve|decline)/;
    expect(names.filter((n) => forbidden.test(n))).toEqual([]);
  });

  it('has a handler for every advertised tool and vice versa', () => {
    expect(Object.keys(handlers).sort()).toEqual([...names].sort());
  });
});

describe('handlers', () => {
  function context(listImpl: (...args: unknown[]) => unknown): ToolContext {
    const api = { pullRequests: { list: listImpl } } as unknown as BitbucketAPI;
    return {
      api,
      defaults: { workspace: 'acme', defaultRepo: 'repo' },
      logger: createLogger('error'),
    };
  }

  it('resolves default repo and returns compact JSON', async () => {
    const list = vi.fn().mockResolvedValue({
      size: 1,
      next: undefined,
      values: [
        {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'Jo' },
          source: { branch: { name: 'f' } },
          destination: { branch: { name: 'main' } },
          comment_count: 0,
          task_count: 0,
        },
      ],
    });

    const result = await handlers.bitbucket_list_pull_requests(context(list), {});
    expect(list).toHaveBeenCalledWith('acme', 'repo', expect.objectContaining({ state: 'OPEN' }));

    const text = result.content[0].text;
    expect(text).not.toContain('\n'); // compact, not pretty-printed
    const parsed = JSON.parse(text);
    expect(parsed.items[0]).toMatchObject({ id: 1, source_branch: 'f', dest_branch: 'main' });
  });

  it('errors clearly when no repo can be resolved', async () => {
    const ctx: ToolContext = {
      api: {} as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };
    await expect(handlers.bitbucket_list_branches(ctx, {})).rejects.toThrow(/repo is required/);
  });
});
