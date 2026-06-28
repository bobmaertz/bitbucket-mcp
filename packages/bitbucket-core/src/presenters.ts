import type { PullRequest, Comment, Task, Branch, Commit, Links } from 'bitbucket-api';

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

export function presentCommit(commit: Commit): Record<string, unknown> {
  return compact({
    hash: shortHash(commit.hash),
    message: commit.message?.trim(),
    author: commit.author?.raw,
    date: commit.date,
  });
}
