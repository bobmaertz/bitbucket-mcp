import { describe, it, expect, vi } from 'vitest';
import type { BitbucketAPI } from '@bobmaertz/bitbucket-api';
import { createLogger } from '@bobmaertz/bitbucket-core';
import { readOnlyTools, handlers, type ToolContext } from './tools.js';

function textOf(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content[0];
  if (block.type !== 'text' || block.text === undefined) {
    throw new Error('expected a text content block');
  }
  return block.text;
}

describe('read-only tool surface', () => {
  const names = readOnlyTools.map((t) => t.name);

  it('exposes exactly the expected read tools', () => {
    expect(names.sort()).toEqual(
      [
        'bitbucket_get_branch',
        'bitbucket_get_comment',
        'bitbucket_get_pipeline',
        'bitbucket_get_pr_commits',
        'bitbucket_get_pr_diff',
        'bitbucket_get_pull_request',
        'bitbucket_get_repository',
        'bitbucket_get_step_log',
        'bitbucket_get_task',
        'bitbucket_list_branches',
        'bitbucket_list_pipeline_steps',
        'bitbucket_list_pipelines',
        'bitbucket_list_pr_comments',
        'bitbucket_list_pr_tasks',
        'bitbucket_list_pull_requests',
        'bitbucket_list_repositories',
        'bitbucket_list_schedules',
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
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };
  }

  it('resolves the target repo and returns compact JSON', async () => {
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

    const result = await handlers.bitbucket_list_pull_requests(context(list), { repo: 'repo' });
    expect(list).toHaveBeenCalledWith('acme', 'repo', expect.objectContaining({ state: 'OPEN' }));

    const text = textOf(result);
    expect(text).not.toContain('\n'); // compact, not pretty-printed
    const parsed = JSON.parse(text);
    expect(parsed.items[0]).toMatchObject({ id: 1, source_branch: 'f', dest_branch: 'main' });
  });

  it('enumerates workspaces and aggregates repos when no workspace is given', async () => {
    const reposList = vi.fn().mockResolvedValue({
      size: 1,
      next: undefined,
      values: [{ full_name: 'acme/widgets', is_private: true, links: {} }],
    });
    const workspacesList = vi.fn().mockResolvedValue({
      size: 1,
      next: undefined,
      values: [{ slug: 'acme', type: 'workspace', links: {} }],
    });
    const ctx = {
      api: {
        repositories: { list: reposList },
        workspaces: { list: workspacesList },
      } as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };

    const result = await handlers.bitbucket_list_repositories(ctx, {});
    expect(workspacesList).toHaveBeenCalledTimes(1);
    expect(reposList).toHaveBeenCalledWith('acme', expect.any(Object));

    const parsed = JSON.parse(textOf(result));
    expect(parsed.repos[0]).toMatchObject({
      full_name: 'acme/widgets',
      slug: 'widgets',
      workspace: 'acme',
    });
  });

  it('returns an empty repos array when a scoped workspace has no repositories', async () => {
    const reposList = vi.fn().mockResolvedValue({ size: 0, next: undefined, values: [] });
    const ctx = {
      api: { repositories: { list: reposList } } as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };

    const result = await handlers.bitbucket_list_repositories(ctx, { workspace: 'empty-ws' });
    expect(reposList).toHaveBeenCalledWith('empty-ws', expect.any(Object));
    const parsed = JSON.parse(textOf(result));
    expect(parsed.repos).toEqual([]);
    expect(result.isError).toBeUndefined();
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

describe('pipeline handlers', () => {
  function ctxWith(pipelines: Record<string, unknown>): ToolContext {
    return {
      api: { pipelines } as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };
  }

  it('builds a branch+status query and labels a PR target', async () => {
    const list = vi.fn().mockResolvedValue({
      size: 1,
      next: undefined,
      values: [
        {
          build_number: 1,
          uuid: '{p}',
          state: { name: 'COMPLETED', result: { name: 'FAILED' } },
          trigger: { type: 'pipeline_trigger_push' },
          target: { type: 'pipeline_pullrequest_target', pullrequest: { id: 7 }, source: 'feat' },
        },
      ],
    });
    const ctx = ctxWith({ list });

    const result = await handlers.bitbucket_list_pipelines(ctx, {
      repo: 'repo',
      branch: 'main',
      status: 'failed',
    });

    expect(list).toHaveBeenCalledWith(
      'acme',
      'repo',
      expect.objectContaining({
        q: 'target.ref_name="main" AND state.result.name="FAILED"',
        sort: '-created_on',
      })
    );
    const parsed = JSON.parse(textOf(result));
    expect(parsed.items[0]).toMatchObject({
      build_number: 1,
      result: 'FAILED',
      target: { pull_request_id: 7 },
    });
  });

  it('accepts a numeric build number for get_pipeline', async () => {
    const get = vi.fn().mockResolvedValue({ build_number: 42, uuid: '{p}', variables: [] });
    const ctx = ctxWith({ get });

    await handlers.bitbucket_get_pipeline(ctx, { repo: 'repo', pipeline: 42 });
    expect(get).toHaveBeenCalledWith('acme', 'repo', '42');
  });

  it('tails and greps step logs, reporting truncation', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => (i % 2 ? `ERROR line ${i}` : `info ${i}`));
    const getStepLog = vi.fn().mockResolvedValue(lines.join('\n'));
    const ctx = ctxWith({ getStepLog });

    const result = await handlers.bitbucket_get_step_log(ctx, {
      repo: 'repo',
      pipeline: '7',
      step: '{s}',
      grep: 'ERROR',
      tail: 2,
    });

    expect(getStepLog).toHaveBeenCalledWith('acme', 'repo', '7', '{s}');
    const parsed = JSON.parse(textOf(result));
    expect(parsed.returned_lines).toBe(2);
    expect(parsed.truncated).toBe(true);
    expect(parsed.text.split('\n').every((l: string) => l.includes('ERROR'))).toBe(true);
  });

  it('requires both pipeline and step for step logs', async () => {
    const ctx = ctxWith({ getStepLog: vi.fn() });
    await expect(
      handlers.bitbucket_get_step_log(ctx, { repo: 'repo', pipeline: '7' })
    ).rejects.toThrow(/step/);
  });
});
