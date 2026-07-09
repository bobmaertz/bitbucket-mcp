import type {
  PullRequest,
  Comment,
  Task,
  Branch,
  Commit,
  Links,
  Repository,
  Pipeline,
  PipelineStep,
  PipelineSchedule,
  PipelineTarget,
  PipelineVariable,
  TreeEntry,
  FileMeta,
  DiffStat,
  Tag,
  FileHistoryEntry,
  CommitStatus,
  PullRequestActivity,
  TestCase,
  Workspace,
  Project,
  Deployment,
  Environment,
  BranchingModel,
  WorkspaceMember,
} from '@bobmaertz/bitbucket-api';

/**
 * Token-sparse presenters.
 *
 * MCP/CLI output lands in an LLM context, so we surface only high-signal
 * fields: flatten nested objects, drop rendered HTML (raw only), shorten
 * commit hashes, collapse `links` to a single browser `url`, and omit
 * null/undefined/empty fields. Booleans are kept even when false — `false`
 * is meaningful (e.g. an unapproved reviewer).
 */

const HASH_LEN = 12;

function shortHash(hash: string | undefined): string | undefined {
  return hash ? hash.slice(0, HASH_LEN) : undefined;
}

function htmlUrl(links: Links | undefined): string | undefined {
  return links?.html?.href;
}

/**
 * Recursively remove null/undefined, empty strings, and empty arrays/objects.
 * Booleans (including false) and zero are preserved.
 */
export function compact<T>(value: T): T {
  return cleanValue(value) as T;
}

function cleanValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cleanValue).filter((v) => !isEmpty(v));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = cleanValue(v);
      if (!isEmpty(cleaned)) out[k] = cleaned;
    }
    return out;
  }
  return value;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/** Lean PR shape for list views. */
export function presentPullRequestSummary(pr: PullRequest): Record<string, unknown> {
  return compact({
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: pr.author?.display_name,
    source_branch: pr.source?.branch?.name,
    dest_branch: pr.destination?.branch?.name,
    comment_count: pr.comment_count,
    task_count: pr.task_count,
    updated_on: pr.updated_on,
    url: htmlUrl(pr.links),
  });
}

/**
 * PR summary for cross-repo listings. Adds the source repo `full_name` so an
 * LLM can tell which repository each PR belongs to when results span a whole
 * workspace. `compact()` drops `repo` when the repository is absent.
 */
export function presentUserPullRequestSummary(pr: PullRequest): Record<string, unknown> {
  return compact({
    ...presentPullRequestSummary(pr),
    repo: pr.destination?.repository?.full_name,
  });
}

/** Rich PR shape for single-PR views. */
export function presentPullRequest(pr: PullRequest): Record<string, unknown> {
  return compact({
    ...presentPullRequestSummary(pr),
    description: pr.description,
    created_on: pr.created_on,
    reviewers: (pr.reviewers ?? []).map((r) => r.display_name),
    participants: (pr.participants ?? []).map((p) =>
      compact({
        name: p.user?.display_name,
        role: p.role,
        approved: p.approved,
      })
    ),
  });
}

export function presentComment(comment: Comment): Record<string, unknown> {
  // Resolution only applies to inline comment threads. For inline comments we
  // emit `resolved` (including `false`, which is meaningful) from the actual
  // `resolution` field rather than inferring; for non-inline comments the
  // concept doesn't apply, so we omit it entirely.
  const isInline = Boolean(comment.inline);
  const resolution = comment.resolution ?? undefined;
  return compact({
    id: comment.id,
    author: comment.user?.display_name,
    content: comment.content?.raw,
    created_on: comment.created_on,
    inline: comment.inline
      ? compact({
          path: comment.inline.path,
          from: comment.inline.from,
          to: comment.inline.to,
        })
      : undefined,
    resolved: isInline ? Boolean(resolution) : undefined,
    resolved_by: resolution?.user?.display_name,
    resolved_on: resolution?.created_on,
    parent_id: comment.parent?.id,
    deleted: comment.deleted || undefined,
  });
}

export function presentTask(task: Task): Record<string, unknown> {
  return compact({
    id: task.id,
    content: task.content?.raw,
    state: task.state,
    creator: task.creator?.display_name,
    created_on: task.created_on,
  });
}

export function presentBranch(branch: Branch): Record<string, unknown> {
  return compact({
    name: branch.name,
    target_hash: shortHash(branch.target?.hash),
    target_date: branch.target?.date,
    author: branch.target?.author?.display_name,
    message: branch.target?.message?.trim(),
  });
}

export function presentRepository(repo: Repository): Record<string, unknown> {
  // `full_name` is "workspace/slug"; derive both from it (slug isn't documented
  // as a standalone field in the Bitbucket spec).
  const [workspace, slug] = (repo.full_name ?? '').split('/');
  return compact({
    full_name: repo.full_name,
    slug: slug || repo.slug,
    workspace,
    is_private: repo.is_private,
    description: repo.description?.trim(),
    language: repo.language,
    project: repo.project?.key,
    mainbranch: repo.mainbranch?.name,
    updated_on: repo.updated_on,
    url: htmlUrl(repo.links),
  });
}

export function presentCommit(commit: Commit): Record<string, unknown> {
  return compact({
    hash: shortHash(commit.hash),
    message: commit.message?.trim(),
    author: commit.author?.raw,
    date: commit.date,
  });
}

// Source / commits / tags -----------------------------------------------------

/** Normalize a `commit_file`/`commit_directory` discriminator to `file`/`dir`. */
function entryKind(type: string | undefined): 'file' | 'dir' {
  return type === 'commit_directory' ? 'dir' : 'file';
}

/** Lean directory-entry shape. `size`/`mimetype` apply to files only. */
export function presentTreeEntry(entry: TreeEntry): Record<string, unknown> {
  return compact({
    path: entry.path,
    type: entryKind(entry.type),
    size: entry.size,
    mimetype: entry.mimetype ?? undefined,
  });
}

/** File metadata (size/mimetype/commit) without the bytes. */
export function presentFileMeta(meta: FileMeta): Record<string, unknown> {
  return compact({
    path: meta.path,
    size: meta.size,
    mimetype: meta.mimetype ?? undefined,
    commit: shortHash(meta.commit?.hash),
    url: htmlUrl(meta.links),
  });
}

/**
 * One file's change summary. `path` is the post-change path; `old_path` is added
 * only for renames so a caller can see the move.
 */
export function presentDiffstat(stat: DiffStat): Record<string, unknown> {
  return compact({
    status: stat.status,
    path: stat.new?.path ?? stat.old?.path,
    old_path: stat.status === 'renamed' ? stat.old?.path : undefined,
    lines_added: stat.lines_added,
    lines_removed: stat.lines_removed,
  });
}

/**
 * Tag shape. `date`/`message`/`tagger` are populated for annotated tags; a
 * lightweight tag falls back to the target commit's date.
 */
export function presentTag(tag: Tag): Record<string, unknown> {
  return compact({
    name: tag.name,
    target_hash: shortHash(tag.target?.hash),
    date: tag.date ?? tag.target?.date,
    message: tag.message?.trim(),
    tagger: tag.tagger?.user?.display_name ?? tag.tagger?.raw,
    url: htmlUrl(tag.links),
  });
}

/** A file-history entry: the commit that touched the file, plus its path then. */
export function presentFileHistoryEntry(entry: FileHistoryEntry): Record<string, unknown> {
  return compact({
    ...presentCommit(entry.commit),
    path: entry.path,
  });
}

// PR & CI depth ---------------------------------------------------------------

/** A CI/build status (used for both PR and commit statuses). */
export function presentCommitStatus(status: CommitStatus): Record<string, unknown> {
  return compact({
    key: status.key,
    name: status.name,
    state: status.state,
    description: status.description,
    url: status.url,
    commit: shortHash(status.commit?.hash),
    updated_on: status.updated_on,
  });
}

/**
 * Normalize a PR activity entry to a single `{ kind, ... }` shape. Each entry
 * carries exactly one of approval / changes_requested / comment / update; the
 * checks are ordered so the present sub-object wins.
 */
export function presentPrActivity(entry: PullRequestActivity): Record<string, unknown> {
  if (entry.approval) {
    return compact({
      kind: 'approval',
      user: entry.approval.user?.display_name,
      date: entry.approval.date,
    });
  }
  if (entry.changes_requested) {
    return compact({
      kind: 'changes_requested',
      user: entry.changes_requested.user?.display_name,
      date: entry.changes_requested.date,
    });
  }
  if (entry.comment) {
    const c = entry.comment;
    return compact({
      kind: 'comment',
      user: c.user?.display_name,
      date: c.created_on,
      content: c.content?.raw,
      inline: c.inline?.path,
    });
  }
  if (entry.update) {
    const u = entry.update;
    return compact({
      kind: 'update',
      user: u.author?.display_name,
      date: u.date,
      state: u.state,
      reason: u.reason,
    });
  }
  return {};
}

/** A single test case (used to surface failing tests from a report). */
export function presentTestCase(testCase: TestCase): Record<string, unknown> {
  return compact({
    name: testCase.fully_qualified_name ?? testCase.name,
    status: testCase.status,
    duration_ms: testCase.duration_in_ms,
  });
}

// Workspace & governance ------------------------------------------------------

export function presentWorkspace(workspace: Workspace): Record<string, unknown> {
  return compact({
    slug: workspace.slug,
    name: workspace.name,
    uuid: workspace.uuid,
    is_private: workspace.is_private,
    url: htmlUrl(workspace.links),
  });
}

export function presentProject(project: Project): Record<string, unknown> {
  return compact({
    key: project.key,
    name: project.name,
    description: project.description?.trim(),
    is_private: project.is_private,
    updated_on: project.updated_on,
    url: htmlUrl(project.links),
  });
}

export function presentDeployment(deployment: Deployment): Record<string, unknown> {
  return compact({
    uuid: deployment.uuid,
    state: deployment.state?.status?.name ?? deployment.state?.name,
    environment: deployment.environment?.name,
    release: deployment.release?.name,
    commit: shortHash(deployment.release?.commit?.hash),
    updated_on: deployment.last_update_time,
  });
}

export function presentEnvironment(environment: Environment): Record<string, unknown> {
  return compact({
    uuid: environment.uuid,
    name: environment.name,
    type: environment.environment_type?.name,
    category: environment.category?.name,
  });
}

/**
 * A repository's effective branching model. `development`/`production` are
 * resolved branch names; `production_enabled` is meaningful (production can be
 * turned off); `branch_types` are the configured kind→prefix mappings.
 */
export function presentBranchingModel(model: BranchingModel): Record<string, unknown> {
  const dev = model.development;
  const prod = model.production;
  return compact({
    development: dev?.branch?.name ?? dev?.name,
    production: prod?.branch?.name ?? prod?.name,
    production_enabled: prod?.enabled,
    branch_types: (model.branch_types ?? []).map((bt) =>
      compact({ kind: bt.kind, prefix: bt.prefix })
    ),
  });
}

export function presentWorkspaceMember(member: WorkspaceMember): Record<string, unknown> {
  return compact({
    name: member.user?.display_name,
    nickname: member.user?.nickname,
    account_id: member.user?.account_id,
    uuid: member.user?.uuid,
  });
}

// Pipelines -------------------------------------------------------------------

/** Map a `pipeline_trigger_*` discriminator to push|manual|schedule. */
function triggerType(type: string | undefined): string | undefined {
  if (!type) return undefined;
  return type.replace(/^pipeline_trigger_/, '').replace(/^scheduled$/, 'schedule');
}

function durationBetween(started?: string, completed?: string): number | undefined {
  if (!started || !completed) return undefined;
  const seconds = Math.round((new Date(completed).getTime() - new Date(started).getTime()) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Normalize a run target to a clean shape: `{ branch }` / `{ tag }` for ref
 * targets, `{ pull_request_id, ref }` for PR targets, `{ commit }` for bare
 * commits. Unknown shapes fall back to whatever ref/commit data is present.
 */
function presentTarget(target: PipelineTarget | undefined): Record<string, unknown> | undefined {
  if (!target) return undefined;
  switch (target.type) {
    case 'pipeline_ref_target': {
      const key = target.ref_type === 'tag' ? 'tag' : 'branch';
      return compact({ [key]: target.ref_name, commit: shortHash(target.commit?.hash) });
    }
    case 'pipeline_pullrequest_target':
      return compact({
        pull_request_id: target.pullrequest?.id,
        ref: target.source ?? target.ref_name,
        commit: shortHash(target.commit?.hash),
      });
    case 'pipeline_commit_target':
      return compact({ commit: shortHash(target.commit?.hash) });
    default:
      return compact({ ref: target.ref_name, commit: shortHash(target.commit?.hash) });
  }
}

/** Secured variables are masked by Bitbucket; surface them as `(secured)`. */
function presentVariable(variable: PipelineVariable): Record<string, unknown> {
  return compact({
    key: variable.key,
    value: variable.secured ? '(secured)' : variable.value,
    secured: variable.secured || undefined,
  });
}

/** Lean pipeline shape for list views. */
export function presentPipelineSummary(pipeline: Pipeline): Record<string, unknown> {
  return compact({
    build_number: pipeline.build_number,
    uuid: pipeline.uuid,
    state: pipeline.state?.name,
    result: pipeline.state?.result?.name,
    trigger_type: triggerType(pipeline.trigger?.type),
    target: presentTarget(pipeline.target),
    created_on: pipeline.created_on,
    duration_in_seconds: pipeline.build_seconds_used,
  });
}

/** Rich pipeline shape for single-run views (adds creator, variables, etc.). */
export function presentPipeline(pipeline: Pipeline): Record<string, unknown> {
  return compact({
    ...presentPipelineSummary(pipeline),
    creator: pipeline.creator?.display_name,
    completed_on: pipeline.completed_on,
    is_scheduled: triggerType(pipeline.trigger?.type) === 'schedule',
    variables: (pipeline.variables ?? []).map(presentVariable),
  });
}

export function presentPipelineStep(step: PipelineStep): Record<string, unknown> {
  return compact({
    step_uuid: step.uuid,
    name: step.name,
    state: step.state?.name,
    result: step.state?.result?.name,
    started_on: step.started_on,
    duration_in_seconds:
      step.duration_in_seconds ?? durationBetween(step.started_on, step.completed_on),
    has_log: Boolean(step.started_on),
  });
}

export function presentSchedule(schedule: PipelineSchedule): Record<string, unknown> {
  return compact({
    uuid: schedule.uuid,
    enabled: schedule.enabled,
    cron_pattern: schedule.cron_pattern,
    target: compact({
      ref_name: schedule.target?.ref_name,
      ref_type: schedule.target?.ref_type,
      selector: schedule.target?.selector?.pattern,
    }),
    type: schedule.type,
  });
}

// Partial-response field sets --------------------------------------------------
//
// Each constant lists exactly the object-relative dotted paths its presenter
// reads. They are sent to Bitbucket as the `fields` query param so the server
// trims the payload before serializing it — the same fields the presenter would
// keep, but dropped at the source instead of after a full download.
//
// These MUST stay in sync with the presenter above each one: if a presenter
// starts reading a new field that isn't listed here, that field is silently
// dropped from the response. `presenters.fields.test.ts` guards against exactly
// that drift by projecting a fixture down to these paths and asserting the
// presenter produces identical output.

/** Fields read by {@link presentPullRequestSummary}. */
export const PR_SUMMARY_FIELDS = [
  'id',
  'title',
  'state',
  'author.display_name',
  'source.branch.name',
  'destination.branch.name',
  'comment_count',
  'task_count',
  'updated_on',
  'links.html.href',
] as const;

/** Fields read by {@link presentUserPullRequestSummary}. */
export const USER_PR_SUMMARY_FIELDS = [
  ...PR_SUMMARY_FIELDS,
  'destination.repository.full_name',
] as const;

/** Fields read by {@link presentPullRequest}. */
export const PR_DETAIL_FIELDS = [
  ...PR_SUMMARY_FIELDS,
  'description',
  'created_on',
  'reviewers.display_name',
  'participants.user.display_name',
  'participants.role',
  'participants.approved',
] as const;

/** Fields read by {@link presentComment}. */
export const COMMENT_FIELDS = [
  'id',
  'user.display_name',
  'content.raw',
  'created_on',
  'inline.path',
  'inline.from',
  'inline.to',
  'resolution.user.display_name',
  'resolution.created_on',
  'parent.id',
  'deleted',
] as const;

/** Fields read by {@link presentTask}. */
export const TASK_FIELDS = [
  'id',
  'content.raw',
  'state',
  'creator.display_name',
  'created_on',
] as const;

/** Fields read by {@link presentBranch}. */
export const BRANCH_FIELDS = [
  'name',
  'target.hash',
  'target.date',
  'target.author.display_name',
  'target.message',
] as const;

/** Fields read by {@link presentRepository}. */
export const REPOSITORY_FIELDS = [
  'full_name',
  'slug',
  'is_private',
  'description',
  'language',
  'project.key',
  'mainbranch.name',
  'updated_on',
  'links.html.href',
] as const;

/** Fields read by {@link presentCommit}. */
export const COMMIT_FIELDS = ['hash', 'message', 'author.raw', 'date'] as const;

/** Fields read by {@link presentTreeEntry}. */
export const TREE_ENTRY_FIELDS = ['path', 'type', 'size', 'mimetype'] as const;

/** Fields read by {@link presentFileMeta}. */
export const FILE_META_FIELDS = [
  'path',
  'size',
  'mimetype',
  'commit.hash',
  'links.html.href',
] as const;

/** Fields read by {@link presentDiffstat}. */
export const DIFFSTAT_FIELDS = [
  'status',
  'new.path',
  'old.path',
  'lines_added',
  'lines_removed',
] as const;

/** Fields read by {@link presentTag}. */
export const TAG_FIELDS = [
  'name',
  'target.hash',
  'target.date',
  'date',
  'message',
  'tagger.user.display_name',
  'tagger.raw',
  'links.html.href',
] as const;

/** Fields read by {@link presentFileHistoryEntry}. */
export const FILE_HISTORY_FIELDS = [
  'path',
  'commit.hash',
  'commit.message',
  'commit.author.raw',
  'commit.date',
] as const;

/** Fields read by {@link presentCommitStatus}. */
export const COMMIT_STATUS_FIELDS = [
  'key',
  'name',
  'state',
  'description',
  'url',
  'commit.hash',
  'updated_on',
] as const;

/** Fields read by {@link presentPrActivity} (across all four entry kinds). */
export const PR_ACTIVITY_FIELDS = [
  'approval.user.display_name',
  'approval.date',
  'changes_requested.user.display_name',
  'changes_requested.date',
  'comment.user.display_name',
  'comment.created_on',
  'comment.content.raw',
  'comment.inline.path',
  'update.author.display_name',
  'update.date',
  'update.state',
  'update.reason',
] as const;

/** Fields read by {@link presentTestCase}. */
export const TEST_CASE_FIELDS = [
  'name',
  'fully_qualified_name',
  'status',
  'duration_in_ms',
] as const;

/** Fields read by {@link presentWorkspace}. */
export const WORKSPACE_FIELDS = ['slug', 'name', 'uuid', 'is_private', 'links.html.href'] as const;

/** Fields read by {@link presentProject}. */
export const PROJECT_FIELDS = [
  'key',
  'name',
  'description',
  'is_private',
  'updated_on',
  'links.html.href',
] as const;

/** Fields read by {@link presentDeployment}. */
export const DEPLOYMENT_FIELDS = [
  'uuid',
  'state.name',
  'state.status.name',
  'environment.name',
  'release.name',
  'release.commit.hash',
  'last_update_time',
] as const;

/** Fields read by {@link presentEnvironment}. */
export const ENVIRONMENT_FIELDS = [
  'uuid',
  'name',
  'environment_type.name',
  'category.name',
] as const;

/** Fields read by {@link presentBranchingModel}. */
export const BRANCHING_MODEL_FIELDS = [
  'development.branch.name',
  'development.name',
  'production.branch.name',
  'production.name',
  'production.enabled',
  'branch_types.kind',
  'branch_types.prefix',
] as const;

/** Fields read by {@link presentWorkspaceMember}. */
export const WORKSPACE_MEMBER_FIELDS = [
  'user.display_name',
  'user.nickname',
  'user.account_id',
  'user.uuid',
] as const;

/** Fields read by {@link presentPipelineSummary} (and {@link presentTarget}). */
export const PIPELINE_SUMMARY_FIELDS = [
  'build_number',
  'uuid',
  'state.name',
  'state.result.name',
  'trigger.type',
  'target.type',
  'target.ref_type',
  'target.ref_name',
  'target.source',
  'target.commit.hash',
  'target.pullrequest.id',
  'created_on',
  'build_seconds_used',
] as const;

/** Fields read by {@link presentPipeline}. */
export const PIPELINE_DETAIL_FIELDS = [
  ...PIPELINE_SUMMARY_FIELDS,
  'creator.display_name',
  'completed_on',
  'variables.key',
  'variables.value',
  'variables.secured',
] as const;

/** Fields read by {@link presentPipelineStep}. */
export const PIPELINE_STEP_FIELDS = [
  'uuid',
  'name',
  'state.name',
  'state.result.name',
  'started_on',
  'completed_on',
  'duration_in_seconds',
] as const;

/** Fields read by {@link presentSchedule}. */
export const SCHEDULE_FIELDS = [
  'uuid',
  'enabled',
  'cron_pattern',
  'target.ref_name',
  'target.ref_type',
  'target.selector.pattern',
  'type',
] as const;

/**
 * Format a field set for a single-object GET: the paths joined verbatim, e.g.
 * `id,title,state`.
 */
export function objectFields(paths: readonly string[]): string {
  return paths.join(',');
}

/**
 * Format a field set for a paginated GET: each path prefixed with `values.` and
 * the envelope keys needed downstream (`next` drives `has_more`, `size` drives
 * `total`) appended — e.g. `values.id,values.title,next,size`.
 */
export function listFields(paths: readonly string[]): string {
  return [...paths.map((p) => `values.${p}`), 'next', 'size'].join(',');
}
