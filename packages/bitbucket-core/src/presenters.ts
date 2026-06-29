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
} from 'bitbucket-api';

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
