import { describe, it, expect } from 'vitest';
import {
  compact,
  presentPullRequestSummary,
  presentComment,
  presentBranch,
  presentPipelineSummary,
  presentPipeline,
  presentPipelineStep,
  presentSchedule,
} from './presenters.js';
import type {
  PullRequest,
  Comment,
  Branch,
  Pipeline,
  PipelineStep,
  PipelineSchedule,
} from 'bitbucket-api';

describe('compact', () => {
  it('drops null/undefined/empty but keeps false and 0', () => {
    expect(compact({ a: null, b: undefined, c: '', d: [], e: {}, f: false, g: 0, h: 'x' })).toEqual(
      {
        f: false,
        g: 0,
        h: 'x',
      }
    );
  });

  it('recurses into nested objects and arrays', () => {
    expect(compact({ a: { b: null, c: 1 }, d: [{ e: '' }, { f: 2 }] })).toEqual({
      a: { c: 1 },
      d: [{ f: 2 }],
    });
  });
});

describe('presentPullRequestSummary', () => {
  it('flattens branches, surfaces the html url, and omits empties', () => {
    const pr = {
      id: 7,
      title: 'Fix bug',
      state: 'OPEN',
      author: { display_name: 'Jo' },
      source: { branch: { name: 'feature/x' } },
      destination: { branch: { name: 'main' } },
      comment_count: 3,
      task_count: 0,
      updated_on: '2026-01-01T00:00:00Z',
      links: { html: { href: 'https://bitbucket.org/acme/repo/pull-requests/7' } },
      description: '',
    } as unknown as PullRequest;

    expect(presentPullRequestSummary(pr)).toEqual({
      id: 7,
      title: 'Fix bug',
      state: 'OPEN',
      author: 'Jo',
      source_branch: 'feature/x',
      dest_branch: 'main',
      comment_count: 3,
      task_count: 0,
      updated_on: '2026-01-01T00:00:00Z',
      url: 'https://bitbucket.org/acme/repo/pull-requests/7',
    });
  });
});

describe('presentComment', () => {
  it('keeps raw content only and drops rendered html', () => {
    const comment = {
      id: 1,
      content: { raw: 'hello', html: '<p>hello</p>', markup: 'markdown' },
      user: { display_name: 'Jo' },
      created_on: '2026-01-01T00:00:00Z',
      deleted: false,
    } as unknown as Comment;

    const out = presentComment(comment);
    expect(out).toMatchObject({ id: 1, author: 'Jo', content: 'hello' });
    expect(JSON.stringify(out)).not.toContain('<p>hello</p>');
    expect(out).not.toHaveProperty('deleted'); // false is dropped here via undefined mapping
  });

  it('omits resolved for non-inline comments', () => {
    const comment = {
      id: 1,
      content: { raw: 'general note' },
      user: { display_name: 'Jo' },
      created_on: '2026-01-01T00:00:00Z',
    } as unknown as Comment;

    expect(presentComment(comment)).not.toHaveProperty('resolved');
  });

  it('surfaces resolved:false for an unresolved inline thread', () => {
    const comment = {
      id: 2,
      content: { raw: 'needs work' },
      user: { display_name: 'Jo' },
      created_on: '2026-01-01T00:00:00Z',
      inline: { path: 'src/a.ts', to: 10 },
    } as unknown as Comment;

    expect(presentComment(comment)).toMatchObject({ resolved: false });
  });

  it('surfaces resolved status with resolver and timestamp for a resolved thread', () => {
    const comment = {
      id: 3,
      content: { raw: 'fixed' },
      user: { display_name: 'Jo' },
      created_on: '2026-01-01T00:00:00Z',
      inline: { path: 'src/a.ts', to: 10 },
      resolution: {
        type: 'comment_resolution',
        user: { display_name: 'Sam' },
        created_on: '2026-01-02T00:00:00Z',
      },
    } as unknown as Comment;

    expect(presentComment(comment)).toMatchObject({
      resolved: true,
      resolved_by: 'Sam',
      resolved_on: '2026-01-02T00:00:00Z',
    });
  });
});

describe('presentBranch', () => {
  it('shortens the target hash to 12 chars', () => {
    const branch = {
      name: 'main',
      target: {
        hash: '0123456789abcdef0123456789abcdef01234567',
        date: '2026-01-01T00:00:00Z',
        author: { display_name: 'Jo' },
        message: 'init\n',
      },
    } as unknown as Branch;

    expect(presentBranch(branch)).toEqual({
      name: 'main',
      target_hash: '0123456789ab',
      target_date: '2026-01-01T00:00:00Z',
      author: 'Jo',
      message: 'init',
    });
  });
});

describe('presentPipelineSummary', () => {
  it('flattens state/result, normalizes trigger and a branch target', () => {
    const pipeline = {
      build_number: 12,
      uuid: '{p}',
      state: { type: 'pipeline_state_completed', name: 'COMPLETED', result: { name: 'FAILED' } },
      trigger: { type: 'pipeline_trigger_push' },
      target: { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: 'feature/x' },
      created_on: '2026-01-01T00:00:00Z',
      build_seconds_used: 87,
    } as unknown as Pipeline;

    expect(presentPipelineSummary(pipeline)).toEqual({
      build_number: 12,
      uuid: '{p}',
      state: 'COMPLETED',
      result: 'FAILED',
      trigger_type: 'push',
      target: { branch: 'feature/x' },
      created_on: '2026-01-01T00:00:00Z',
      duration_in_seconds: 87,
    });
  });

  it('normalizes a pull-request target', () => {
    const pipeline = {
      build_number: 5,
      uuid: '{p}',
      trigger: { type: 'pipeline_trigger_push' },
      target: { type: 'pipeline_pullrequest_target', pullrequest: { id: 99 }, source: 'feature/y' },
    } as unknown as Pipeline;

    expect(presentPipelineSummary(pipeline).target).toEqual({
      pull_request_id: 99,
      ref: 'feature/y',
    });
  });
});

describe('presentPipeline', () => {
  it('masks secured variables and flags scheduled runs', () => {
    const pipeline = {
      build_number: 3,
      uuid: '{p}',
      trigger: { type: 'pipeline_trigger_schedule' },
      creator: { display_name: 'Jo' },
      completed_on: '2026-01-01T01:00:00Z',
      variables: [
        { key: 'ENV', value: 'prod' },
        { key: 'TOKEN', value: 'xxx', secured: true },
      ],
    } as unknown as Pipeline;

    const out = presentPipeline(pipeline);
    expect(out.creator).toBe('Jo');
    expect(out.is_scheduled).toBe(true);
    expect(out.variables).toEqual([
      { key: 'ENV', value: 'prod' },
      { key: 'TOKEN', value: '(secured)', secured: true },
    ]);
    expect(JSON.stringify(out)).not.toContain('xxx');
  });
});

describe('presentPipelineStep', () => {
  it('derives duration and has_log, surfaces pass/fail', () => {
    const step = {
      uuid: '{s}',
      name: 'Build',
      state: {
        type: 'pipeline_step_state_completed',
        name: 'COMPLETED',
        result: { name: 'SUCCESSFUL' },
      },
      started_on: '2026-01-01T00:00:00Z',
      completed_on: '2026-01-01T00:00:30Z',
    } as unknown as PipelineStep;

    expect(presentPipelineStep(step)).toEqual({
      step_uuid: '{s}',
      name: 'Build',
      state: 'COMPLETED',
      result: 'SUCCESSFUL',
      started_on: '2026-01-01T00:00:00Z',
      duration_in_seconds: 30,
      has_log: true,
    });
  });

  it('reports has_log=false for a step that has not started', () => {
    const step = { uuid: '{s}', state: { type: 'x', name: 'PENDING' } } as unknown as PipelineStep;
    expect(presentPipelineStep(step)).toMatchObject({ has_log: false });
  });
});

describe('presentSchedule', () => {
  it('surfaces cron pattern, enabled flag, and target ref', () => {
    const schedule = {
      uuid: '{sc}',
      enabled: false,
      cron_pattern: '0 0 * * *',
      target: { ref_type: 'branch', ref_name: 'main' },
    } as unknown as PipelineSchedule;

    expect(presentSchedule(schedule)).toEqual({
      uuid: '{sc}',
      enabled: false,
      cron_pattern: '0 0 * * *',
      target: { ref_name: 'main', ref_type: 'branch' },
    });
  });
});
