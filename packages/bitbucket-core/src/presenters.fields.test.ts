import { describe, it, expect } from 'vitest';
import {
  presentPullRequestSummary,
  presentUserPullRequestSummary,
  presentPullRequest,
  presentComment,
  presentTask,
  presentBranch,
  presentRepository,
  presentCommit,
  presentPipelineSummary,
  presentPipeline,
  presentPipelineStep,
  presentSchedule,
  presentTreeEntry,
  presentFileMeta,
  presentDiffstat,
  presentTag,
  presentFileHistoryEntry,
  presentCommitStatus,
  presentPrActivity,
  presentTestCase,
  presentWorkspace,
  presentProject,
  presentDeployment,
  presentEnvironment,
  presentBranchingModel,
  presentWorkspaceMember,
  objectFields,
  listFields,
  PR_SUMMARY_FIELDS,
  USER_PR_SUMMARY_FIELDS,
  PR_DETAIL_FIELDS,
  COMMENT_FIELDS,
  TASK_FIELDS,
  BRANCH_FIELDS,
  REPOSITORY_FIELDS,
  COMMIT_FIELDS,
  PIPELINE_SUMMARY_FIELDS,
  PIPELINE_DETAIL_FIELDS,
  PIPELINE_STEP_FIELDS,
  SCHEDULE_FIELDS,
  TREE_ENTRY_FIELDS,
  FILE_META_FIELDS,
  DIFFSTAT_FIELDS,
  TAG_FIELDS,
  FILE_HISTORY_FIELDS,
  COMMIT_STATUS_FIELDS,
  PR_ACTIVITY_FIELDS,
  TEST_CASE_FIELDS,
  WORKSPACE_FIELDS,
  PROJECT_FIELDS,
  DEPLOYMENT_FIELDS,
  ENVIRONMENT_FIELDS,
  BRANCHING_MODEL_FIELDS,
  WORKSPACE_MEMBER_FIELDS,
} from './presenters.js';

/**
 * Simulate Bitbucket's `fields` partial-response projection: given a fully
 * populated object, keep only the declared dotted paths (projecting element-wise
 * across arrays), exactly as the server would before serializing. If a presenter
 * reads a path that isn't declared in its field set, the projected object won't
 * carry it and the presenter's output will differ — which is the drift we want
 * to catch.
 */
function project(source: unknown, paths: readonly string[]): unknown {
  if (source === null || typeof source !== 'object') return source;
  const result: Record<string, unknown> = {};
  for (const path of paths) {
    setPath(result, source as Record<string, unknown>, path.split('.'));
  }
  return result;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setPath(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  segs: string[]
): void {
  const [head, ...rest] = segs;
  if (!(head in source)) return;
  const val = source[head];
  if (val === undefined) return;

  if (rest.length === 0) {
    target[head] = clone(val);
    return;
  }

  if (Array.isArray(val)) {
    const arr = (Array.isArray(target[head]) ? target[head] : []) as Record<string, unknown>[];
    target[head] = arr;
    val.forEach((el, i) => {
      if (el === null || typeof el !== 'object') return;
      if (typeof arr[i] !== 'object' || arr[i] === null) arr[i] = {};
      setPath(arr[i], el as Record<string, unknown>, rest);
    });
  } else if (val !== null && typeof val === 'object') {
    const child = (
      typeof target[head] === 'object' && target[head] !== null ? target[head] : {}
    ) as Record<string, unknown>;
    target[head] = child;
    setPath(child, val as Record<string, unknown>, rest);
  }
}

// Fully-populated fixtures — every declared field is present so the projection
// is a genuine subset test, and enough extra noise fields are present to prove
// the presenter isn't accidentally passing the raw object through.

const prFixture = {
  id: 42,
  title: 'Add widget',
  state: 'OPEN',
  author: { display_name: 'Ada', account_id: 'a1', uuid: '{a}' },
  source: { branch: { name: 'feat/widget' }, commit: { hash: 'deadbeefcafe0000' } },
  destination: {
    branch: { name: 'main' },
    repository: { full_name: 'acme/widgets', uuid: '{r}' },
  },
  comment_count: 3,
  task_count: 1,
  updated_on: '2026-07-01T10:00:00Z',
  created_on: '2026-06-30T10:00:00Z',
  description: 'A widget.',
  reviewers: [{ display_name: 'Grace', uuid: '{g}' }],
  participants: [
    { user: { display_name: 'Linus', uuid: '{l}' }, role: 'REVIEWER', approved: true },
  ],
  links: { html: { href: 'https://bitbucket.org/acme/widgets/pull-requests/42' }, self: {} },
} as never;

const commentFixture = {
  id: 7,
  user: { display_name: 'Ada' },
  content: { raw: 'looks good', html: '<p>looks good</p>' },
  created_on: '2026-07-01T10:00:00Z',
  inline: { path: 'src/a.ts', from: 1, to: 2 },
  resolution: { user: { display_name: 'Grace' }, created_on: '2026-07-02T10:00:00Z' },
  parent: { id: 6 },
  deleted: false,
} as never;

const taskFixture = {
  id: 3,
  content: { raw: 'fix the thing', html: '<p>fix</p>' },
  state: 'UNRESOLVED',
  creator: { display_name: 'Ada' },
  created_on: '2026-07-01T10:00:00Z',
} as never;

const branchFixture = {
  name: 'main',
  target: {
    hash: 'deadbeefcafe0000',
    date: '2026-07-01T10:00:00Z',
    author: { raw: 'Ada <ada@x.io>', user: { display_name: 'Ada' } },
    message: 'ship it\n',
  },
} as never;

const repoFixture = {
  full_name: 'acme/widgets',
  slug: 'widgets',
  is_private: true,
  description: 'Widgets galore',
  language: 'typescript',
  project: { key: 'WID', name: 'Widgets' },
  mainbranch: { name: 'main' },
  updated_on: '2026-07-01T10:00:00Z',
  size: 12345,
  links: { html: { href: 'https://bitbucket.org/acme/widgets' }, self: {} },
} as never;

const commitFixture = {
  hash: 'deadbeefcafe0000',
  message: 'ship it\n',
  author: { raw: 'Ada <ada@x.io>', user: { display_name: 'Ada' } },
  date: '2026-07-01T10:00:00Z',
} as never;

const pipelineFixture = {
  build_number: 101,
  uuid: '{p}',
  state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } },
  trigger: { type: 'pipeline_trigger_push' },
  target: {
    type: 'pipeline_ref_target',
    ref_type: 'branch',
    ref_name: 'main',
    source: 'feat/x',
    commit: { hash: 'deadbeefcafe0000' },
    pullrequest: { id: 42 },
  },
  created_on: '2026-07-01T10:00:00Z',
  completed_on: '2026-07-01T10:05:00Z',
  build_seconds_used: 300,
  creator: { display_name: 'Ada' },
  variables: [{ key: 'FOO', value: 'bar', secured: false }],
} as never;

const stepFixture = {
  uuid: '{s}',
  name: 'build',
  state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } },
  started_on: '2026-07-01T10:00:00Z',
  completed_on: '2026-07-01T10:04:00Z',
  duration_in_seconds: 240,
} as never;

const scheduleFixture = {
  uuid: '{sch}',
  enabled: true,
  cron_pattern: '0 0 * * *',
  target: { ref_name: 'main', ref_type: 'branch', selector: { pattern: 'default' } },
  type: 'pipeline_schedule',
} as never;

const treeEntryFixture = {
  path: 'src/index.ts',
  type: 'commit_file',
  size: 2048,
  mimetype: 'text/plain',
  commit: { hash: 'deadbeefcafe0000', type: 'commit' },
  attributes: [],
  links: { self: {} },
} as never;

const fileMetaFixture = {
  path: 'src/index.ts',
  type: 'commit_file',
  size: 2048,
  mimetype: 'text/plain',
  encoding: 'utf-8',
  commit: { hash: 'deadbeefcafe0000', type: 'commit', links: {} },
  links: { html: { href: 'https://bitbucket.org/acme/widgets/src/main/src/index.ts' }, self: {} },
} as never;

const diffstatFixture = {
  type: 'diffstat',
  status: 'renamed',
  lines_added: 10,
  lines_removed: 4,
  old: { path: 'src/old.ts', type: 'commit_file' },
  new: { path: 'src/new.ts', type: 'commit_file' },
} as never;

const tagFixture = {
  name: 'v1.2.0',
  target: {
    hash: 'deadbeefcafe0000',
    date: '2026-07-01T10:00:00Z',
    message: 'release commit',
    type: 'commit',
  },
  message: 'Release 1.2.0\n',
  date: '2026-07-02T10:00:00Z',
  tagger: { raw: 'Ada <ada@x.io>', user: { display_name: 'Ada' } },
  links: { html: { href: 'https://bitbucket.org/acme/widgets/commits/tag/v1.2.0' }, self: {} },
  type: 'tag',
} as never;

const fileHistoryFixture = {
  path: 'src/index.ts',
  type: 'commit_file',
  size: 2048,
  commit: {
    hash: 'deadbeefcafe0000',
    message: 'edit index\n',
    author: { raw: 'Ada <ada@x.io>', user: { display_name: 'Ada' } },
    date: '2026-07-01T10:00:00Z',
  },
  links: { self: {} },
} as never;

const commitStatusFixture = {
  key: 'build-1',
  name: 'CI Build',
  state: 'SUCCESSFUL',
  description: 'All good',
  url: 'https://ci.example.com/build/1',
  refname: 'main',
  commit: { hash: 'deadbeefcafe0000', type: 'commit' },
  created_on: '2026-07-01T10:00:00Z',
  updated_on: '2026-07-01T10:05:00Z',
  type: 'build',
} as never;

const testCaseFixture = {
  uuid: '{tc}',
  name: 'testFoo',
  fully_qualified_name: 'com.acme.FooTest.testFoo',
  status: 'FAILED',
  duration_in_ms: 42,
  type: 'test_case',
} as never;

const activityApprovalFixture = {
  pull_request: { id: 42 },
  approval: { date: '2026-07-01T10:00:00Z', user: { display_name: 'Grace' } },
} as never;

const activityChangesFixture = {
  pull_request: { id: 42 },
  changes_requested: { date: '2026-07-01T10:00:00Z', user: { display_name: 'Linus' } },
} as never;

const activityCommentFixture = {
  pull_request: { id: 42 },
  comment: {
    user: { display_name: 'Ada' },
    created_on: '2026-07-01T10:00:00Z',
    content: { raw: 'nit', html: '<p>nit</p>' },
    inline: { path: 'src/a.ts', from: 1, to: 2 },
  },
} as never;

const activityUpdateFixture = {
  pull_request: { id: 42 },
  update: {
    date: '2026-07-01T10:00:00Z',
    author: { display_name: 'Ada' },
    state: 'OPEN',
    reason: '',
    title: 'Add widget',
  },
} as never;

const workspaceFixture = {
  slug: 'acme',
  name: 'Acme Inc',
  uuid: '{ws}',
  is_private: true,
  links: { html: { href: 'https://bitbucket.org/acme/' }, self: {} },
  type: 'workspace',
} as never;

const projectFixture = {
  key: 'WID',
  name: 'Widgets',
  uuid: '{proj}',
  description: 'Widget project',
  is_private: true,
  created_on: '2026-06-01T10:00:00Z',
  updated_on: '2026-07-01T10:00:00Z',
  links: { html: { href: 'https://bitbucket.org/acme/workspace/projects/WID' }, self: {} },
  type: 'project',
} as never;

const deploymentFixture = {
  uuid: '{dep}',
  state: { name: 'IN_PROGRESS', status: { name: 'COMPLETED' } },
  environment: { uuid: '{env}', name: 'Production' },
  release: { name: 'v1.2.0', commit: { hash: 'deadbeefcafe0000' } },
  last_update_time: '2026-07-01T10:00:00Z',
  type: 'deployment',
} as never;

const environmentFixture = {
  uuid: '{env}',
  name: 'Production',
  environment_type: { name: 'Production', rank: 2 },
  category: { name: 'prod' },
  type: 'deployment_environment',
} as never;

const branchingModelFixture = {
  type: 'branching_model',
  development: { branch: { name: 'develop' }, use_mainbranch: false },
  production: { enabled: true, branch: { name: 'main' }, use_mainbranch: true },
  branch_types: [
    { kind: 'feature', prefix: 'feature/' },
    { kind: 'hotfix', prefix: 'hotfix/' },
  ],
} as never;

const workspaceMemberFixture = {
  type: 'workspace_membership',
  user: { display_name: 'Ada', nickname: 'ada', account_id: 'acc-1', uuid: '{u}' },
  workspace: { slug: 'acme', name: 'Acme Inc', uuid: '{ws}' },
} as never;

describe('presenter field sets stay in sync with presenters', () => {
  const cases: Array<{
    name: string;
    present: (v: never) => unknown;
    fields: readonly string[];
    fixture: never;
  }> = [
    {
      name: 'PR summary',
      present: presentPullRequestSummary,
      fields: PR_SUMMARY_FIELDS,
      fixture: prFixture,
    },
    {
      name: 'user PR summary',
      present: presentUserPullRequestSummary,
      fields: USER_PR_SUMMARY_FIELDS,
      fixture: prFixture,
    },
    {
      name: 'PR detail',
      present: presentPullRequest,
      fields: PR_DETAIL_FIELDS,
      fixture: prFixture,
    },
    { name: 'comment', present: presentComment, fields: COMMENT_FIELDS, fixture: commentFixture },
    { name: 'task', present: presentTask, fields: TASK_FIELDS, fixture: taskFixture },
    { name: 'branch', present: presentBranch, fields: BRANCH_FIELDS, fixture: branchFixture },
    {
      name: 'repository',
      present: presentRepository,
      fields: REPOSITORY_FIELDS,
      fixture: repoFixture,
    },
    { name: 'commit', present: presentCommit, fields: COMMIT_FIELDS, fixture: commitFixture },
    {
      name: 'pipeline summary',
      present: presentPipelineSummary,
      fields: PIPELINE_SUMMARY_FIELDS,
      fixture: pipelineFixture,
    },
    {
      name: 'pipeline detail',
      present: presentPipeline,
      fields: PIPELINE_DETAIL_FIELDS,
      fixture: pipelineFixture,
    },
    {
      name: 'tree entry',
      present: presentTreeEntry,
      fields: TREE_ENTRY_FIELDS,
      fixture: treeEntryFixture,
    },
    {
      name: 'file meta',
      present: presentFileMeta,
      fields: FILE_META_FIELDS,
      fixture: fileMetaFixture,
    },
    {
      name: 'diffstat',
      present: presentDiffstat,
      fields: DIFFSTAT_FIELDS,
      fixture: diffstatFixture,
    },
    { name: 'tag', present: presentTag, fields: TAG_FIELDS, fixture: tagFixture },
    {
      name: 'file history entry',
      present: presentFileHistoryEntry,
      fields: FILE_HISTORY_FIELDS,
      fixture: fileHistoryFixture,
    },
    {
      name: 'commit status',
      present: presentCommitStatus,
      fields: COMMIT_STATUS_FIELDS,
      fixture: commitStatusFixture,
    },
    {
      name: 'test case',
      present: presentTestCase,
      fields: TEST_CASE_FIELDS,
      fixture: testCaseFixture,
    },
    {
      name: 'pr activity (approval)',
      present: presentPrActivity,
      fields: PR_ACTIVITY_FIELDS,
      fixture: activityApprovalFixture,
    },
    {
      name: 'pr activity (changes requested)',
      present: presentPrActivity,
      fields: PR_ACTIVITY_FIELDS,
      fixture: activityChangesFixture,
    },
    {
      name: 'pr activity (comment)',
      present: presentPrActivity,
      fields: PR_ACTIVITY_FIELDS,
      fixture: activityCommentFixture,
    },
    {
      name: 'pr activity (update)',
      present: presentPrActivity,
      fields: PR_ACTIVITY_FIELDS,
      fixture: activityUpdateFixture,
    },
    {
      name: 'workspace',
      present: presentWorkspace,
      fields: WORKSPACE_FIELDS,
      fixture: workspaceFixture,
    },
    { name: 'project', present: presentProject, fields: PROJECT_FIELDS, fixture: projectFixture },
    {
      name: 'deployment',
      present: presentDeployment,
      fields: DEPLOYMENT_FIELDS,
      fixture: deploymentFixture,
    },
    {
      name: 'environment',
      present: presentEnvironment,
      fields: ENVIRONMENT_FIELDS,
      fixture: environmentFixture,
    },
    {
      name: 'branching model',
      present: presentBranchingModel,
      fields: BRANCHING_MODEL_FIELDS,
      fixture: branchingModelFixture,
    },
    {
      name: 'workspace member',
      present: presentWorkspaceMember,
      fields: WORKSPACE_MEMBER_FIELDS,
      fixture: workspaceMemberFixture,
    },
    {
      name: 'pipeline step',
      present: presentPipelineStep,
      fields: PIPELINE_STEP_FIELDS,
      fixture: stepFixture,
    },
    {
      name: 'schedule',
      present: presentSchedule,
      fields: SCHEDULE_FIELDS,
      fixture: scheduleFixture,
    },
  ];

  for (const { name, present, fields, fixture } of cases) {
    it(`${name}: projecting to its field set doesn't change the output`, () => {
      const full = present(fixture);
      const projected = present(project(fixture, fields) as never);
      expect(projected).toEqual(full);
      // Sanity: the presenter actually produced something to compare.
      expect(Object.keys(full as object).length).toBeGreaterThan(0);
    });
  }

  it('covers every pipeline target variant', () => {
    const variants = [
      {
        type: 'pipeline_ref_target',
        ref_type: 'tag',
        ref_name: 'v1.0',
        commit: { hash: 'abc123def456' },
      },
      {
        type: 'pipeline_pullrequest_target',
        pullrequest: { id: 9 },
        source: 'feat/y',
        ref_name: 'feat/y',
        commit: { hash: 'abc123def456' },
      },
      { type: 'pipeline_commit_target', commit: { hash: 'abc123def456' } },
      { type: 'something_else', ref_name: 'weird', commit: { hash: 'abc123def456' } },
    ];
    for (const target of variants) {
      const fixture = { ...(pipelineFixture as object), target } as never;
      const full = presentPipelineSummary(fixture);
      const projected = presentPipelineSummary(project(fixture, PIPELINE_SUMMARY_FIELDS) as never);
      expect(projected).toEqual(full);
    }
  });
});

describe('field-set formatters', () => {
  it('objectFields joins paths verbatim', () => {
    expect(objectFields(['id', 'title', 'state'])).toBe('id,title,state');
  });

  it('listFields prefixes with values. and appends the envelope keys', () => {
    expect(listFields(['id', 'title'])).toBe('values.id,values.title,next,size');
  });
});
