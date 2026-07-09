# Bitbucket Cloud API Audit & MCP Roadmap

_Audit date: 2026-07-09. Sources: this repo's source (traced tool → operation → HTTP call), the official
Bitbucket Cloud Swagger spec (`api.bitbucket.org/swagger.json`, 193 paths, fetched on the audit date),
and Atlassian's REST intro / rate-limit / deprecation announcements._

This document is the gap analysis between what the MCP server exposes today and what the Bitbucket
Cloud REST API 2.0 offers, followed by a phased plan for new read-only capabilities and efficiency
improvements. The server's read-only, token-sparse philosophy is preserved throughout — nothing in
this plan proposes exposing write operations.

---

## 1. Current state

**18 read-only MCP tools** (README currently documents only 13 — see § 5 Housekeeping):

| Area              | Tools                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Repositories      | `list_repositories`, `get_repository`                                                                |
| Pull requests     | `list_pull_requests`, `list_user_pull_requests`, `get_pull_request`, `get_pr_commits`, `get_pr_diff` |
| PR comments/tasks | `list_pr_comments`, `get_comment`, `list_pr_tasks`, `get_task`                                       |
| Branches          | `list_branches`, `get_branch`                                                                        |
| Pipelines         | `list_pipelines`, `get_pipeline`, `list_pipeline_steps`, `get_step_log`, `list_schedules`            |

Implemented in the client but **not exposed** as tools: `pullRequests.getPatch`, `workspaces.list`
(`GET /user/workspaces`), and the full write surface (PR create/update/approve/decline/merge,
comment/task/branch CRUD) reserved behind the unused `BITBUCKET_ALLOW_WRITES` gate.

Efficiency posture today: token savings come entirely from **client-side presenters** (field
trimming, short hashes, compact JSON), client-side diff/log truncation, and dropping the opaque
`next` URL from page envelopes. The client supports `q` and `sort` but **not** Bitbucket's
server-side `fields` partial-response parameter, does not use `Range` requests for logs, and has no
caching. Auth is Basic only (API token or legacy app password).

## 2. What the API offers that we don't touch

Grouped by value to an LLM agent. Scope names are the legacy OAuth-style scopes from the spec;
the granular `read:*:bitbucket` API-token scopes map onto them.

### High value — "give the agent eyes on the repo"

| Capability                     | Endpoints                                                                        | Notes                                                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source browsing**            | `GET /repositories/{ws}/{repo}/src/{commit}/{path}`                              | Dual-purpose: directory → paginated JSON listing; file → raw contents. `?format=meta` returns file metadata (size, type) without the bytes; `?max_depth=N` returns a recursive tree in one call. Biggest single gap today. |
| **File history**               | `GET .../filehistory/{commit}/{path}`                                            | `git log --follow` for a file; supports `q`, `sort`, `fields`, `renames=false`.                                                                                                                                            |
| **Commits**                    | `GET .../commits` (+ POST bulk form), `GET .../commit/{hash}`                    | List supports `include`/`exclude` refs and `path` filter.                                                                                                                                                                  |
| **Commit diff/diffstat/patch** | `GET .../diff/{spec}`, `.../diffstat/{spec}`, `.../patch/{spec}`                 | `{spec}` can be a single hash or `a..b`. Diff supports `path` (repeatable), `context`, `ignore_whitespace`, `topic` (three-dot merge-base diff). Diffstat is the cheap JSON change summary.                                |
| **Merge base**                 | `GET .../merge-base/{a}..{b}`                                                    | Common-ancestor lookup.                                                                                                                                                                                                    |
| **Tags**                       | `GET .../refs/tags[/{name}]`, `GET .../refs`                                     | We cover branches only; `/refs` returns branches + tags in one call.                                                                                                                                                       |
| **Build/commit statuses**      | `GET .../commit/{hash}/statuses`, `GET .../pullrequests/{id}/statuses`           | CI visibility for third-party CI, not just Bitbucket Pipelines.                                                                                                                                                            |
| **PR diffstat**                | `GET .../pullrequests/{id}/diffstat`                                             | Per-file added/removed lines — a far cheaper "what changed" than the full diff we fetch today.                                                                                                                             |
| **PR activity**                | `GET .../pullrequests/{id}/activity` (and repo-wide `.../pullrequests/activity`) | Approvals, updates, comment events in one timeline.                                                                                                                                                                        |
| **PRs for a commit**           | `GET .../commit/{hash}/pullrequests`                                             | "Which PR introduced this?"                                                                                                                                                                                                |

### Medium value — CI/CD and review context

| Capability                          | Endpoints                                                                                                                          | Notes                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Pipeline test reports**           | `GET .../steps/{step}/test_reports`, `.../test_reports/test_cases`, `.../test_case_reasons`                                        | Turns "pipeline failed" into named failing tests with failure output, without grepping full logs. |
| **Deployments/environments**        | `GET .../deployments[/{uuid}]`, `.../environments[/{uuid}]`                                                                        | Read-only release visibility.                                                                     |
| **Effective default reviewers**     | `GET .../effective-default-reviewers`                                                                                              | Includes project-level inheritance; plain `default-reviewers` also available.                     |
| **PR conflicts**                    | `GET .../pullrequests/{id}/conflicts`, `GET .../file-conflicts/{spec}`                                                             | Mergeability diagnostics.                                                                         |
| **Projects**                        | `GET /workspaces/{ws}/projects[/{key}]`                                                                                            | Plus repos-by-project via `GET /repositories/{ws}?q=project.key="KEY"`.                           |
| **Workspaces**                      | `GET /user/workspaces`                                                                                                             | Client code already exists — just needs a tool.                                                   |
| **Workspace members / permissions** | `GET /workspaces/{ws}/members`, `.../permissions`, `.../permissions/repositories[/{repo}]`, `GET /user/workspaces/{ws}/permission` | Effective-permission reads; useful for "who can touch this repo".                                 |
| **Branching model**                 | `GET .../branching-model`, `.../effective-branching-model`                                                                         | Development/production branch conventions; plain `repository` scope.                              |
| **Repo pipeline variables**         | `GET .../pipelines_config/variables` (repo & workspace)                                                                            | Secured values come back masked; presenter already has masking convention.                        |

### Low value / niche

Forks (`GET .../forks`), watchers, webhooks read (`GET .../hooks`, needs `webhook` scope),
code-insights reports/annotations (`GET .../commit/{hash}/reports[...]`), downloads list, snippets,
deploy keys. Branch restrictions reads exist but **require `repository:admin` even to read** — poor
fit for a least-privilege read-only server.

### Deliberately skipped (deprecations)

- **Issue tracker** — entire API group flagged deprecated; Bitbucket Issues/Wikis are removed
  **August 20, 2026**. Do not build.
- **Code search** (`GET /workspaces/{ws}/search/code`) — spec says deprecated **November 1, 2026**,
  requires workspace opt-in, indexes default branches only. Do not build on it.
- Anything under `/teams/*`, and cross-workspace list APIs (`GET /repositories`, `GET /workspaces`,
  `GET /snippets`, `GET /user/permissions/*`) — already EOL'd; the codebase correctly avoids these
  (CHANGE-2770 notes in `repositories.ts` / `workspaces.ts`).

## 3. Efficiency gaps (no new endpoints required)

1. **`fields` partial responses — the single biggest win.** Nearly every JSON endpoint accepts
   `?fields=` with dotted paths (`values.title`), `+`/`-` modifiers, and wildcards. Atlassian
   evaluates fields lazily server-side, so trimmed requests are also _faster_, not just smaller.
   Since the presenters already define exactly which fields each tool keeps, each operation can send
   a matching `fields` list and stop downloading the ~90% of the payload the presenter throws away.
   Presenters stay as the safety net / shaping layer.
2. **`Range` requests for step logs.** `getStepLog` currently downloads the entire log and tails it
   client-side. The log endpoint supports HTTP `Range`; fetch only the last N bytes.
3. **Scoped diffs.** `getPullRequestDiff` downloads the full diff then truncates to `max_lines`.
   The diff endpoints accept `path` (repeatable) and `context` params — expose a `path` filter so
   agents can pull one file's diff, and prefer diffstat-first workflows.
4. **Rate-limit awareness.** Authenticated API-token calls get ~1,000 req/hr; workspace/project/repo
   **Access Tokens get scaled limits (+10/paid seat, up to 10,000 req/hr)**. Two actions: honor the
   `X-RateLimit-NearLimit` header (surface a warning in tool output before 429s), and support
   **Bearer auth** for access tokens (currently Basic-only) — both an auth-hardening and a
   rate-limit win.
5. **Pagelen clamp bug.** `listPipelines` / `listPipelineSteps` / `listSchedules` pass `pagelen`
   through without `clampPagelen` (`operations.ts:351,373,449`), unlike every other list op.
6. **`max_depth` on `/src`** — one recursive tree call instead of N directory listings (see § 2).
7. **Pagelen caps vary per endpoint** (PR lists cap at 50, most at 100) — clamp per-endpoint rather
   than globally at 100, and keep dropping the `next` URL as today.

## 4. Proposed build-out plan

Four phases, each independently shippable. Tool names follow the existing `bitbucket_<verb>_<noun>`
convention; all new tools are read-only GETs behind the existing presenter/truncation patterns.

**Status:** Phase 1 ✅ delivered · Phase 2 ✅ delivered · Phase 3 ✅ delivered · Phase 4 ✅ delivered.
All four phases are complete; the surface is now **40 read-only tools**.

### Phase 1 — Efficiency & hygiene (no new API surface) — ✅ delivered

| Item | Change                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1  | Add `fields?: string` support to `ListOptions`/request layer; derive per-operation `fields` lists from the presenters and send them on every existing GET.   |
| 1.2  | `Range`-based log fetching in `pipelines.getStepLog` (fall back to full fetch if 416/no support).                                                            |
| 1.3  | Add `path`/`context` params to PR diff fetching; fix `clampPagelen` on the three pipeline list ops; per-endpoint pagelen caps.                               |
| 1.4  | Bearer-token auth mode (workspace/project/repo access tokens) alongside Basic; read `X-RateLimit-NearLimit` and annotate tool responses when near the limit. |
| 1.5  | Docs sync (see § 5) and removal countdown for app-password fallback.                                                                                         |

### Phase 2 — Source & commits (9 new tools) — ✅ delivered

Delivered as `bitbucket_list_directory`, `bitbucket_get_file`, `bitbucket_get_file_history`,
`bitbucket_list_commits`, `bitbucket_get_commit`, `bitbucket_get_commit_diff`,
`bitbucket_get_diffstat`, `bitbucket_list_tags`, and `bitbucket_get_tag`. Source-browsing tools
default `commit` to the repo's main branch (resolved once, then echoed as `ref`); `get_file` caps
content and flags binary files; all send server-side `fields` and reuse the shared diff-truncation
helper.

| Tool                         | Endpoint                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bitbucket_list_directory`   | `GET /src/{commit}/{path}` (dir mode; `max_depth`, `q`, `sort`)                                                                                            |
| `bitbucket_get_file`         | `GET /src/{commit}/{path}` (file mode; `format=meta` first when size-unknown, then ranged/truncated content with `max_lines`-style cap like the diff tool) |
| `bitbucket_get_file_history` | `GET /filehistory/{commit}/{path}`                                                                                                                         |
| `bitbucket_list_commits`     | `GET /commits` (`include`/`exclude`, `path`)                                                                                                               |
| `bitbucket_get_commit`       | `GET /commit/{hash}`                                                                                                                                       |
| `bitbucket_get_commit_diff`  | `GET /diff/{spec}` (with `path`, `context`; reuse diff truncation)                                                                                         |
| `bitbucket_get_diffstat`     | `GET /diffstat/{spec}`                                                                                                                                     |
| `bitbucket_list_tags`        | `GET /refs/tags` (+ `get_tag` if warranted)                                                                                                                |

Default branch resolution: reuse `get_repository`'s `mainbranch` (already presented) — no new tool.

### Phase 3 — PR & CI depth (6 new tools) — ✅ delivered

Delivered as `bitbucket_get_pr_diffstat`, `bitbucket_list_pr_statuses`,
`bitbucket_list_commit_statuses`, `bitbucket_get_pr_activity`,
`bitbucket_list_commit_pull_requests`, and `bitbucket_get_test_reports` (which composes the
step's report summary + test cases + per-case failure reasons into one result, capping per-case
reason lookups). PR activity entries are normalized to a `{ kind, user, date, ... }` shape;
statuses reuse one presenter for both the PR and commit endpoints; `get_pr_diff`'s description now
points at the cheaper diffstat first.

| Tool                                  | Endpoint                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bitbucket_get_pr_diffstat`           | `GET /pullrequests/{id}/diffstat` — recommend in `get_pr_diff`'s description as the cheap first step                                 |
| `bitbucket_list_pr_statuses`          | `GET /pullrequests/{id}/statuses`                                                                                                    |
| `bitbucket_list_commit_statuses`      | `GET /commit/{hash}/statuses`                                                                                                        |
| `bitbucket_get_pr_activity`           | `GET /pullrequests/{id}/activity`                                                                                                    |
| `bitbucket_list_commit_pull_requests` | `GET /commit/{hash}/pullrequests`                                                                                                    |
| `bitbucket_get_test_reports`          | `GET /steps/{step}/test_reports` + `/test_cases` + `/test_case_reasons`, composed into one summarized "failing tests + reasons" tool |

### Phase 4 — Workspace & governance reads (7 new tools) — ✅ delivered

Delivered as `bitbucket_list_workspaces`, `bitbucket_list_projects`, `bitbucket_get_project`,
`bitbucket_list_deployments`, `bitbucket_list_environments`, `bitbucket_get_branching_model`, and
`bitbucket_list_workspace_members`. The optional `effective-default-reviewers` and repo-permissions
tools were **deferred** to avoid tool-count creep (branch-restriction reads also require
`repository:admin`, a poor fit for a least-privilege read-only server). Workspace-scoped tools
(`list_projects`, `get_project`, `list_workspace_members`) fall back to `BITBUCKET_WORKSPACE`;
`list_workspaces` reuses the existing `workspaces.list` client code and trims client-side because of
its access-token envelope.

| Tool                                                                                      | Endpoint                                                                                   |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `bitbucket_list_workspaces`                                                               | `GET /user/workspaces` (client code already exists)                                        |
| `bitbucket_list_projects` / `bitbucket_get_project`                                       | `GET /workspaces/{ws}/projects[/{key}]`                                                    |
| `bitbucket_list_deployments` / `bitbucket_list_environments`                              | `GET /deployments`, `GET /environments`                                                    |
| `bitbucket_get_branching_model`                                                           | `GET /effective-branching-model`                                                           |
| `bitbucket_list_workspace_members`                                                        | `GET /workspaces/{ws}/members`                                                             |
| (optional) `bitbucket_get_effective_default_reviewers`, `bitbucket_list_repo_permissions` | `GET /effective-default-reviewers`, `GET /workspaces/{ws}/permissions/repositories/{repo}` |

End state: ~38 read-only tools. Tool-count creep is a real MCP concern — if the client's model
struggles with selection, fold near-duplicates (e.g. tags into a `refs` tool, commit/PR statuses
into one tool with a target param) before shipping Phase 4.

## 5. Housekeeping found during the audit

- ✅ **README under-documents the surface** — fixed in Phase 1; the tool table now tracks the full
  surface (40 tools after Phase 4).
- ✅ **Broken links** to `docs/ai/DESIGN.md` / `docs/ai/IMPLEMENTATION_PLAN.md` — repointed to this
  document in Phase 1.
- **`docs/PROJECT_SUMMARY.md` / `docs/GETTING_STARTED.md` are still historical**: they describe write
  tools and app-password auth as the primary path. Their broken links are fixed and banners flag them
  as historical, but a full rewrite (or removal) is still outstanding — the README is the accurate
  reference.
- **App passwords are removed by Atlassian on July 28, 2026** (brownouts already running). The legacy
  `BITBUCKET_USERNAME`/`BITBUCKET_APP_PASSWORD` path still works as a fallback; it should be deleted
  shortly after removal day (access-token Bearer auth added in Phase 1 is the recommended path).
- `pullRequests.getPatch` is implemented but unexposed — the diff/diffstat tools (Phases 1–3) cover
  the common "what changed" need, so the raw patch remains intentionally unexposed for now.
