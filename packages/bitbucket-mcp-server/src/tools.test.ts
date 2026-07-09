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
        'bitbucket_get_branching_model',
        'bitbucket_get_comment',
        'bitbucket_get_commit',
        'bitbucket_get_commit_diff',
        'bitbucket_get_diffstat',
        'bitbucket_get_file',
        'bitbucket_get_file_history',
        'bitbucket_get_pipeline',
        'bitbucket_get_pr_activity',
        'bitbucket_get_pr_commits',
        'bitbucket_get_pr_diff',
        'bitbucket_get_pr_diffstat',
        'bitbucket_get_project',
        'bitbucket_get_pull_request',
        'bitbucket_get_repository',
        'bitbucket_get_step_log',
        'bitbucket_get_tag',
        'bitbucket_get_task',
        'bitbucket_get_test_reports',
        'bitbucket_list_branches',
        'bitbucket_list_commit_pull_requests',
        'bitbucket_list_commit_statuses',
        'bitbucket_list_commits',
        'bitbucket_list_deployments',
        'bitbucket_list_directory',
        'bitbucket_list_environments',
        'bitbucket_list_pipeline_steps',
        'bitbucket_list_pipelines',
        'bitbucket_list_pr_comments',
        'bitbucket_list_pr_statuses',
        'bitbucket_list_pr_tasks',
        'bitbucket_list_projects',
        'bitbucket_list_pull_requests',
        'bitbucket_list_repositories',
        'bitbucket_list_schedules',
        'bitbucket_list_tags',
        'bitbucket_list_user_pull_requests',
        'bitbucket_list_workspace_members',
        'bitbucket_list_workspaces',
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

  it('lists a user PRs across a workspace, defaulting to me + newest-updated', async () => {
    const getCurrent = vi.fn().mockResolvedValue({ account_id: 'acc-1', uuid: '{me}' });
    const listByWorkspaceUser = vi.fn().mockResolvedValue({
      size: 1,
      next: undefined,
      values: [
        {
          id: 7,
          title: 'PR',
          state: 'OPEN',
          author: { display_name: 'Jo' },
          source: { branch: { name: 'f' } },
          destination: { branch: { name: 'main' }, repository: { full_name: 'acme/widgets' } },
          comment_count: 0,
          task_count: 0,
        },
      ],
    });
    const ctx = {
      api: {
        users: { getCurrent },
        pullRequests: { listByWorkspaceUser },
      } as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };

    const result = await handlers.bitbucket_list_user_pull_requests(ctx, {});

    // Defaulted the selected_user to the authenticated account and sorted newest-updated.
    expect(getCurrent).toHaveBeenCalledOnce();
    expect(listByWorkspaceUser).toHaveBeenCalledWith(
      'acme',
      'acc-1',
      expect.objectContaining({ state: 'OPEN', sort: '-updated_on' })
    );

    const text = textOf(result);
    expect(text).not.toContain('\n'); // compact
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ truncated: false, has_more: false, pages_fetched: 1 });
    expect(parsed.items[0]).toMatchObject({ id: 7, repo: 'acme/widgets' });
  });

  it('uses an explicit user without calling GET /user', async () => {
    const getCurrent = vi.fn();
    const listByWorkspaceUser = vi.fn().mockResolvedValue({ size: 0, next: undefined, values: [] });
    const ctx = {
      api: {
        users: { getCurrent },
        pullRequests: { listByWorkspaceUser },
      } as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };

    await handlers.bitbucket_list_user_pull_requests(ctx, { user: '{someone}' });

    expect(getCurrent).not.toHaveBeenCalled();
    expect(listByWorkspaceUser).toHaveBeenCalledWith('acme', '{someone}', expect.any(Object));
  });

  // CHANGE-2770 regression: omitting `workspace` must scope to the configured
  // BITBUCKET_WORKSPACE via `GET /repositories/{workspace}` — never the retired
  // cross-workspace `GET /workspaces` enumeration.
  it('defaults to the configured workspace when none is given', async () => {
    const reposList = vi.fn().mockResolvedValue({
      size: 1,
      next: undefined,
      values: [{ full_name: 'acme/widgets', is_private: true, links: {} }],
    });
    const workspacesList = vi.fn();
    const ctx = {
      api: {
        repositories: { list: reposList },
        workspaces: { list: workspacesList },
      } as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };

    const result = await handlers.bitbucket_list_repositories(ctx, {});
    expect(reposList).toHaveBeenCalledWith('acme', expect.any(Object));
    expect(workspacesList).not.toHaveBeenCalled(); // no deprecated workspace listing

    const parsed = JSON.parse(textOf(result));
    expect(parsed.repos[0]).toMatchObject({
      full_name: 'acme/widgets',
      slug: 'widgets',
      workspace: 'acme',
    });
  });

  it('uses an explicit workspace arg over the configured default', async () => {
    const reposList = vi.fn().mockResolvedValue({ size: 0, next: undefined, values: [] });
    const ctx = {
      api: { repositories: { list: reposList } } as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };

    await handlers.bitbucket_list_repositories(ctx, { workspace: 'other' });
    expect(reposList).toHaveBeenCalledWith('other', expect.any(Object));
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
    expect(get).toHaveBeenCalledWith(
      'acme',
      'repo',
      '42',
      expect.objectContaining({ fields: expect.any(String) })
    );
  });

  it('tails and greps step logs, reporting truncation', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => (i % 2 ? `ERROR line ${i}` : `info ${i}`));
    const text = lines.join('\n');
    const getStepLog = vi
      .fn()
      .mockResolvedValue({ text, totalBytes: Buffer.byteLength(text), partial: false });
    const ctx = ctxWith({ getStepLog });

    const result = await handlers.bitbucket_get_step_log(ctx, {
      repo: 'repo',
      pipeline: '7',
      step: '{s}',
      grep: 'ERROR',
      tail: 2,
    });

    // grep must scan the whole log, so no Range header is sent (undefined).
    expect(getStepLog).toHaveBeenCalledWith('acme', 'repo', '7', '{s}', undefined);
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

describe('source/commits/tags handlers', () => {
  function ctxWith(api: Record<string, unknown>): ToolContext {
    return {
      api: api as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };
  }

  it('get_file requires a path', async () => {
    const ctx = ctxWith({ source: {}, repositories: {} });
    await expect(handlers.bitbucket_get_file(ctx, { repo: 'repo' })).rejects.toThrow(/path/);
  });

  it('list_directory lists entries and echoes the resolved ref/path', async () => {
    const listDirectory = vi.fn().mockResolvedValue({
      size: 2,
      next: undefined,
      values: [
        { path: 'src/a.ts', type: 'commit_file', size: 10, mimetype: 'text/plain' },
        { path: 'src/lib', type: 'commit_directory' },
      ],
    });
    const ctx = ctxWith({ source: { listDirectory } });

    const result = await handlers.bitbucket_list_directory(ctx, {
      repo: 'repo',
      commit: 'main',
      path: 'src',
      max_depth: 2,
    });
    // Explicit commit means no default-branch lookup is needed.
    expect(listDirectory).toHaveBeenCalledWith(
      'acme',
      'repo',
      'main',
      'src',
      expect.objectContaining({ maxDepth: 2, fields: expect.any(String) })
    );
    const parsed = JSON.parse(textOf(result));
    expect(parsed.ref).toBe('main');
    expect(parsed.path).toBe('src');
    expect(parsed.items).toEqual([
      { path: 'src/a.ts', type: 'file', size: 10, mimetype: 'text/plain' },
      { path: 'src/lib', type: 'dir' },
    ]);
  });

  it('get_commit_diff forwards path/context and caps lines', async () => {
    const diff = ['diff --git a/x b/x', ...Array.from({ length: 50 }, (_, i) => `+l ${i}`)].join(
      '\n'
    );
    const getDiff = vi.fn().mockResolvedValue(diff);
    const ctx = ctxWith({ commits: { getDiff } });

    const result = await handlers.bitbucket_get_commit_diff(ctx, {
      repo: 'repo',
      spec: 'aaa..bbb',
      path: 'src/x.ts',
      context: 0,
      max_lines: 10,
    });
    expect(getDiff).toHaveBeenCalledWith(
      'acme',
      'repo',
      'aaa..bbb',
      expect.objectContaining({ path: 'src/x.ts', context: 0 })
    );
    const parsed = JSON.parse(textOf(result));
    expect(parsed.truncated).toBe(true);
    expect(parsed.diff.split('\n')).toHaveLength(10);
  });

  it('get_tag resolves a tag by name', async () => {
    const get = vi.fn().mockResolvedValue({
      name: 'v1.0.0',
      target: { hash: 'deadbeefcafe0000', date: '2026-07-01T10:00:00Z' },
      tagger: { user: { display_name: 'Ada' } },
    });
    const ctx = ctxWith({ tags: { get } });

    const result = await handlers.bitbucket_get_tag(ctx, { repo: 'repo', name: 'v1.0.0' });
    expect(get).toHaveBeenCalledWith(
      'acme',
      'repo',
      'v1.0.0',
      expect.objectContaining({ fields: expect.any(String) })
    );
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toMatchObject({ name: 'v1.0.0', target_hash: 'deadbeefcafe', tagger: 'Ada' });
  });
});

describe('pr/ci-depth handlers', () => {
  function ctxWith(api: Record<string, unknown>): ToolContext {
    return {
      api: api as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };
  }

  it('list_commit_statuses requires a commit', async () => {
    const ctx = ctxWith({ commits: {} });
    await expect(handlers.bitbucket_list_commit_statuses(ctx, { repo: 'repo' })).rejects.toThrow(
      /commit/
    );
  });

  it('get_pr_activity normalizes entries by kind', async () => {
    const getActivity = vi.fn().mockResolvedValue({
      size: 1,
      next: undefined,
      values: [{ approval: { date: '2026-07-01T10:00:00Z', user: { display_name: 'Grace' } } }],
    });
    const ctx = ctxWith({ pullRequests: { getActivity } });

    const result = await handlers.bitbucket_get_pr_activity(ctx, { repo: 'repo', id: 42 });
    const parsed = JSON.parse(textOf(result));
    expect(parsed.items).toEqual([
      { kind: 'approval', user: 'Grace', date: '2026-07-01T10:00:00Z' },
    ]);
  });

  it('get_test_reports composes summary + failing cases with reasons', async () => {
    const pipelines = {
      getTestReport: vi.fn().mockResolvedValue({
        total_test_count: 2,
        passed_test_count: 1,
        failed_test_count: 1,
        error_test_count: 0,
        skipped_test_count: 0,
      }),
      getTestCases: vi.fn().mockResolvedValue({
        values: [
          { uuid: '{c1}', fully_qualified_name: 'T.a', status: 'PASSED' },
          { uuid: '{c2}', fully_qualified_name: 'T.b', status: 'FAILED' },
        ],
      }),
      getTestCaseReasons: vi.fn().mockResolvedValue({ values: [{ message: 'boom' }] }),
    };
    const ctx = ctxWith({ pipelines });

    const result = await handlers.bitbucket_get_test_reports(ctx, {
      repo: 'repo',
      pipeline: 7,
      step: '{s}',
    });
    const parsed = JSON.parse(textOf(result));
    expect(parsed.summary).toEqual({ total: 2, passed: 1, failed: 1, error: 0, skipped: 0 });
    expect(parsed.failing).toEqual([{ name: 'T.b', status: 'FAILED', reasons: 'boom' }]);
  });

  it('get_test_reports handles a step with no report', async () => {
    const { NotFoundError } = await import('@bobmaertz/bitbucket-api');
    const pipelines = {
      getTestReport: vi.fn().mockRejectedValue(new NotFoundError('test report')),
    };
    const ctx = ctxWith({ pipelines });
    const result = await handlers.bitbucket_get_test_reports(ctx, {
      repo: 'repo',
      pipeline: 7,
      step: '{s}',
    });
    const parsed = JSON.parse(textOf(result));
    expect(parsed.no_report).toBe(true);
    expect(parsed.failing).toEqual([]);
  });
});

describe('workspace/governance handlers', () => {
  function ctxWith(api: Record<string, unknown>): ToolContext {
    return {
      api: api as unknown as BitbucketAPI,
      defaults: { workspace: 'acme' },
      logger: createLogger('error'),
    };
  }

  it('list_projects defaults to the configured workspace', async () => {
    const list = vi.fn().mockResolvedValue({ size: 0, next: undefined, values: [] });
    const ctx = ctxWith({ projects: { list } });

    await handlers.bitbucket_list_projects(ctx, {});
    expect(list).toHaveBeenCalledWith('acme', expect.any(Object));
  });

  it('list_workspaces needs no workspace and unwraps entries', async () => {
    const list = vi.fn().mockResolvedValue({
      size: 1,
      next: undefined,
      values: [{ slug: 'acme', name: 'Acme', uuid: '{w}', links: {} }],
    });
    const ctx = ctxWith({ workspaces: { list } });

    const result = await handlers.bitbucket_list_workspaces(ctx, {});
    expect(list).toHaveBeenCalledOnce();
    const parsed = JSON.parse(textOf(result));
    expect(parsed.items[0]).toMatchObject({ slug: 'acme', name: 'Acme' });
  });

  it('get_branching_model shapes dev/prod branches and types', async () => {
    const getBranchingModel = vi.fn().mockResolvedValue({
      development: { branch: { name: 'develop' } },
      production: { enabled: true, branch: { name: 'main' } },
      branch_types: [{ kind: 'feature', prefix: 'feature/' }],
    });
    const ctx = ctxWith({ branches: { getBranchingModel } });

    const result = await handlers.bitbucket_get_branching_model(ctx, { repo: 'repo' });
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual({
      development: 'develop',
      production: 'main',
      production_enabled: true,
      branch_types: [{ kind: 'feature', prefix: 'feature/' }],
    });
  });
});
