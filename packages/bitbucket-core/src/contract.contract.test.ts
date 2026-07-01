import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import {
  presentPullRequestSummary,
  presentComment,
  presentTask,
  presentBranch,
  presentPipelineSummary,
  presentPipelineStep,
  presentSchedule,
  presentRepository,
} from './presenters.js';

/**
 * Contract tests: assert our client's request surface and the response shapes
 * our presenters depend on against the vendored Bitbucket OpenAPI (Swagger 2.0)
 * spec. This is the high-fidelity "does the contract still hold" tier — run via
 * `npm run test:contract`, in its own CI job, or manually. Refresh the spec with
 * `npm run refresh-spec`.
 */

interface Spec {
  swagger: string;
  basePath: string;
  paths: Record<string, Record<string, unknown>>;
  definitions: Record<string, { properties?: Record<string, unknown>; allOf?: unknown[] }>;
}

const specPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'contract',
  'bitbucket-openapi.json'
);
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as Spec;

let ajv: Ajv;
beforeAll(() => {
  ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(spec, 'bb');
});

function validator(definition: string): ValidateFunction {
  return ajv.compile({ $ref: `bb#/definitions/${definition}` });
}

/** Collect property names across allOf members and resolved $refs (shallow). */
function collectProps(name: string, seen = new Set<string>()): Set<string> {
  const result = new Set<string>();
  if (seen.has(name)) return result;
  seen.add(name);
  const def = spec.definitions[name];
  if (!def) return result;
  for (const key of Object.keys(def.properties ?? {})) result.add(key);
  for (const member of def.allOf ?? []) {
    const m = member as { properties?: Record<string, unknown>; $ref?: string };
    for (const key of Object.keys(m.properties ?? {})) result.add(key);
    if (m.$ref) {
      const refName = m.$ref.split('/').pop()!;
      for (const key of collectProps(refName, seen)) result.add(key);
    }
  }
  return result;
}

// The exact endpoints our bitbucket-api resources call (read surface + the
// deferred roadmap). Path keys must match the spec's templated paths verbatim.
const REPO = '/repositories/{workspace}/{repo_slug}';
const READ_ENDPOINTS: Array<[string, string]> = [
  ['/user', 'get'],
  ['/user/workspaces', 'get'],
  ['/workspaces/{workspace}/pullrequests/{selected_user}', 'get'],
  ['/repositories/{workspace}', 'get'],
  [REPO, 'get'],
  [`${REPO}/pullrequests`, 'get'],
  [`${REPO}/pullrequests/{pull_request_id}`, 'get'],
  [`${REPO}/pullrequests/{pull_request_id}/commits`, 'get'],
  [`${REPO}/pullrequests/{pull_request_id}/diff`, 'get'],
  [`${REPO}/pullrequests/{pull_request_id}/comments`, 'get'],
  [`${REPO}/pullrequests/{pull_request_id}/comments/{comment_id}`, 'get'],
  [`${REPO}/pullrequests/{pull_request_id}/tasks`, 'get'],
  [`${REPO}/pullrequests/{pull_request_id}/tasks/{task_id}`, 'get'],
  [`${REPO}/refs/branches`, 'get'],
  [`${REPO}/refs/branches/{name}`, 'get'],
  [`${REPO}/pipelines`, 'get'],
  [`${REPO}/pipelines/{pipeline_uuid}`, 'get'],
  [`${REPO}/pipelines/{pipeline_uuid}/steps`, 'get'],
  [`${REPO}/pipelines/{pipeline_uuid}/steps/{step_uuid}/log`, 'get'],
  [`${REPO}/pipelines_config/schedules`, 'get'],
];
const ROADMAP_ENDPOINTS: Array<[string, string]> = [
  [`${REPO}/refs/tags`, 'get'],
  [`${REPO}/refs/tags`, 'post'], // cut a version (tag) — write, opt-in
];

describe('spec sanity', () => {
  it('is the Bitbucket Cloud v2 Swagger document', () => {
    expect(spec.swagger).toBe('2.0');
    expect(spec.basePath).toBe('/2.0');
    expect(Object.keys(spec.definitions).length).toBeGreaterThan(100);
  });
});

describe('request-surface contract', () => {
  it.each(READ_ENDPOINTS)('exposes %s [%s]', (path, method) => {
    expect(spec.paths[path], `missing path ${path}`).toBeDefined();
    expect(spec.paths[path][method], `missing ${method} on ${path}`).toBeDefined();
  });

  it.each(ROADMAP_ENDPOINTS)('roadmap endpoint exists: %s [%s]', (path, method) => {
    expect(spec.paths[path]?.[method], `missing ${method} on ${path}`).toBeDefined();
  });
});

describe('no-deprecated-endpoints guard', () => {
  // Every endpoint we call must NOT be flagged `deprecated` in the upstream
  // spec. This is the CHANGE-2770 regression guard: `GET /workspaces` and the
  // cross-workspace `GET /repositories` are marked deprecated, so reintroducing
  // either to our request surface fails here.
  it.each([...READ_ENDPOINTS, ...ROADMAP_ENDPOINTS])(
    '%s [%s] is not deprecated upstream',
    (path, method) => {
      const op = spec.paths[path]?.[method] as { deprecated?: boolean } | undefined;
      expect(op, `missing ${method} on ${path}`).toBeDefined();
      expect(op?.deprecated ?? false, `${method} ${path} is deprecated upstream`).toBe(false);
    }
  );

  // Endpoints CHANGE-2770 retired must never appear in our request surface.
  const RETIRED = ['/workspaces', '/repositories'];
  it.each(RETIRED)('does not use the retired endpoint %s', (path) => {
    const used = READ_ENDPOINTS.some(([p]) => p === path);
    expect(used, `${path} was retired by CHANGE-2770 and must not be used`).toBe(false);
  });
});

describe('field-dependency contract', () => {
  // Properties our presenters read must exist in the spec definitions, so
  // upstream renames/removals are caught here rather than at runtime.
  const expectations: Array<[string, string[]]> = [
    [
      'pullrequest',
      [
        'id',
        'title',
        'state',
        'author',
        'source',
        'destination',
        'comment_count',
        'task_count',
        'links',
        'created_on',
        'updated_on',
        'reviewers',
        'participants',
      ],
    ],
    ['comment', ['id', 'content', 'user', 'created_on', 'inline', 'parent', 'deleted', 'links']],
    ['task', ['id', 'content', 'state', 'creator', 'created_on']],
    ['ref', ['type', 'name', 'target', 'links']],
    ['commit', ['hash', 'date', 'message', 'author']],
    ['tag', ['name', 'target', 'message']],
    [
      'pipeline',
      [
        'build_number',
        'uuid',
        'state',
        'target',
        'trigger',
        'creator',
        'created_on',
        'completed_on',
        'build_seconds_used',
        'variables',
      ],
    ],
    ['pipeline_step', ['uuid', 'state', 'started_on', 'completed_on']],
    ['pipeline_schedule', ['uuid', 'enabled', 'cron_pattern', 'target']],
    ['pipeline_variable', ['key', 'value', 'secured']],
    [
      'repository',
      [
        'full_name',
        'is_private',
        'description',
        'language',
        'project',
        'mainbranch',
        'updated_on',
        'links',
      ],
    ],
    // We only read `slug` off each workspace to enumerate per-workspace repos.
    ['workspace', ['slug', 'name', 'uuid', 'links']],
  ];

  it.each(expectations)('%s defines the fields we depend on', (definition, fields) => {
    const props = collectProps(definition);
    for (const field of fields) {
      expect(props.has(field), `${definition} is missing '${field}'`).toBe(true);
    }
  });
});

describe('response-shape contract', () => {
  const account = { type: 'user', display_name: 'Jo', uuid: '{u}' };
  const rendered = { raw: 'text', markup: 'markdown', html: '<p>text</p>' };

  const pullRequest = {
    type: 'pullrequest',
    id: 42,
    title: 'Add feature',
    state: 'OPEN',
    author: account,
    source: { branch: { name: 'feature/x' } },
    destination: { branch: { name: 'main' } },
    comment_count: 2,
    task_count: 0,
    created_on: '2026-01-01T00:00:00Z',
    updated_on: '2026-01-01T00:00:00Z',
    reviewers: [],
    participants: [],
    links: {
      self: { href: 'https://api/x' },
      html: { href: 'https://bitbucket.org/acme/repo/pull-requests/42' },
    },
  };

  const comment = {
    type: 'pullrequest_comment',
    id: 1,
    content: rendered,
    user: account,
    created_on: '2026-01-01T00:00:00Z',
    updated_on: '2026-01-01T00:00:00Z',
    deleted: false,
    links: { self: { href: 'https://api/x' } },
  };

  const task = {
    id: 1,
    created_on: '2026-01-01T00:00:00Z',
    updated_on: '2026-01-01T00:00:00Z',
    state: 'UNRESOLVED',
    content: rendered,
    creator: account,
  };

  const branch = {
    type: 'branch',
    name: 'main',
    target: {
      type: 'commit',
      hash: '0123456789abcdef0123456789abcdef01234567',
      date: '2026-01-01T00:00:00Z',
      message: 'init',
      author: { type: 'author', raw: 'Jo <jo@example.com>' },
    },
    links: { self: { href: 'https://api/x' } },
  };

  const repository = {
    type: 'repository',
    name: 'repo',
    full_name: 'acme/repo',
    slug: 'repo',
    uuid: '{r}',
    is_private: true,
    created_on: '2026-01-01T00:00:00Z',
    updated_on: '2026-01-02T00:00:00Z',
    size: 1024,
    language: 'typescript',
    description: 'A repo',
    project: { type: 'project', key: 'PROJ', name: 'Project', uuid: '{p}', links: {} },
    mainbranch: { type: 'branch', name: 'main' },
    links: {
      self: { href: 'https://api/x' },
      html: { href: 'https://bitbucket.org/acme/repo' },
    },
  };

  function check(definition: string, value: unknown): void {
    const validate = validator(definition);
    const ok = validate(value);
    if (!ok) throw new Error(`${definition} invalid: ${ajv.errorsText(validate.errors)}`);
    expect(ok).toBe(true);
  }

  it('a pull request validates against the spec', () => check('pullrequest', pullRequest));

  it('a paginated PR page validates against the spec', () =>
    check('paginated_pullrequests', { size: 1, page: 1, pagelen: 25, values: [pullRequest] }));

  it('a PR comment validates against the spec', () => check('pullrequest_comment', comment));

  it('a task validates against the spec', () => check('task', task));

  it('a branch validates against the spec', () => check('branch', branch));

  const pipeline = {
    type: 'pipeline',
    uuid: '{p}',
    build_number: 12,
    state: {
      type: 'pipeline_state_completed',
      name: 'COMPLETED',
      result: { type: 'pipeline_state_completed_failed', name: 'FAILED' },
    },
    target: { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: 'main' },
    trigger: { type: 'pipeline_trigger_push' },
    created_on: '2026-01-01T00:00:00Z',
    completed_on: '2026-01-01T00:01:00Z',
    build_seconds_used: 60,
  };

  const pipelineStep = {
    type: 'pipeline_step',
    uuid: '{s}',
    state: {
      type: 'pipeline_step_state_completed',
      name: 'COMPLETED',
      result: { type: 'pipeline_step_state_completed_successful', name: 'SUCCESSFUL' },
    },
    started_on: '2026-01-01T00:00:00Z',
    completed_on: '2026-01-01T00:00:30Z',
  };

  const schedule = {
    type: 'pipeline_schedule',
    uuid: '{sc}',
    enabled: true,
    cron_pattern: '0 0 * * *',
    target: { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: 'main' },
  };

  it('a pipeline validates against the spec', () => check('pipeline', pipeline));

  it('a paginated pipeline page validates against the spec', () =>
    check('paginated_pipelines', { size: 1, page: 1, pagelen: 25, values: [pipeline] }));

  it('a pipeline step validates against the spec', () => check('pipeline_step', pipelineStep));

  it('a pipeline schedule validates against the spec', () => check('pipeline_schedule', schedule));

  it('pipeline presenters produce lean output from spec-valid payloads', () => {
    expect(presentPipelineSummary(pipeline as never)).toMatchObject({
      build_number: 12,
      state: 'COMPLETED',
      result: 'FAILED',
      trigger_type: 'push',
      target: { branch: 'main' },
      duration_in_seconds: 60,
    });
    expect(presentPipelineStep(pipelineStep as never)).toMatchObject({
      step_uuid: '{s}',
      result: 'SUCCESSFUL',
      has_log: true,
    });
    expect(presentSchedule(schedule as never)).toMatchObject({
      uuid: '{sc}',
      enabled: true,
      cron_pattern: '0 0 * * *',
    });
  });

  it('a repository validates against the spec', () => check('repository', repository));

  it('a paginated repository page validates against the spec', () =>
    check('paginated_repositories', { size: 1, page: 1, pagelen: 25, values: [repository] }));

  // Spec-valid payloads flow through our presenters to the expected lean shape:
  // this ties the published contract to our actual output.
  it('presenters produce lean output from spec-valid payloads', () => {
    expect(presentPullRequestSummary(pullRequest as never)).toMatchObject({
      id: 42,
      source_branch: 'feature/x',
      dest_branch: 'main',
      url: 'https://bitbucket.org/acme/repo/pull-requests/42',
    });
    const c = presentComment(comment as never);
    expect(c).toMatchObject({ id: 1, author: 'Jo', content: 'text' });
    expect(JSON.stringify(c)).not.toContain('<p>text</p>'); // html dropped
    expect(presentTask(task as never)).toMatchObject({
      id: 1,
      state: 'UNRESOLVED',
      content: 'text',
    });
    expect(presentBranch(branch as never)).toMatchObject({
      name: 'main',
      target_hash: '0123456789ab',
    });
    expect(presentRepository(repository as never)).toMatchObject({
      full_name: 'acme/repo',
      slug: 'repo',
      workspace: 'acme',
      is_private: true,
      project: 'PROJ',
      mainbranch: 'main',
      url: 'https://bitbucket.org/acme/repo',
    });
  });
});
