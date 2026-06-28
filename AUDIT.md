# Bitbucket MCP — Audit, Hardening & Read-Only Restructure

Single source of truth for this round of work: the security/quality audit, the
MCP interface, the auth migration, and the deferred roadmap. Terse by design.

> **Stack note:** this is a TypeScript/Node monorepo (kept and hardened — not
> Go). Three packages: `bitbucket-api` (REST client), `bitbucket-core` (shared
> config/logging/presenters/operations — consumed by the MCP server **and** a
> future CLI), `bitbucket-mcp-server` (thin stdio adapter).

## Audit findings

Severity reflects the state **before** this round. "Status" = what this round did.

### Critical

| ID  | Finding                                                                                                                                                                                                                                   | Status                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| C1  | Auth used deprecated Bitbucket **App Passwords** (`username:appPassword`). Atlassian disabled new app passwords (Sep 2025), full removal 2026. Modern path is Basic auth with **`email:api_token`** (username field must be the _email_). | **Fixed** — `email:apiToken` is canonical; legacy pair still accepted with a deprecation warning. |

### Serious

| ID  | Finding                                                                                                                                                      | Status                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| S1  | Token-leak vector: the whole `AxiosError` (incl. `config.headers.Authorization`) was wrapped into thrown errors; raw response bodies retained; no redaction. | **Fixed** — errors carry only status + scrubbed message; `toJSON` allowlist; central `redactSecrets`.                 |
| S2  | No credential isolation: full config (incl. secret) was injected into every tool handler; token stored as plain field.                                       | **Fixed** — secret confined to `AuthHandler` behind a `Secret` wrapper; handlers get only non-secret target defaults. |
| S3  | No 429/rate-limit handling (`RateLimitError` defined but unused).                                                                                            | **Fixed** — bounded retry + backoff honoring `Retry-After`; idempotent-only retry for network/5xx.                    |

### Moderate

| ID  | Finding                                                                                  | Status                                                                                               |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| M1  | Pagination synthesized `page` numbers instead of following the opaque `next` link.       | **Fixed** — `getAllPages` follows `next` verbatim; logs on truncation.                               |
| M2  | Write-heavy MCP surface (create/delete/merge/approve) contradicted the read-only intent. | **Fixed** — MCP surface trimmed to read-only; writes gated behind `BITBUCKET_ALLOW_WRITES` (future). |
| M3  | Unvalidated config (`LOG_LEVEL` cast blindly; no trim/format checks).                    | **Fixed** — validated + normalized; email-shape check under API-token auth.                          |
| M4  | `LOG_LEVEL` accepted but unused; ad-hoc `console.error`.                                 | **Fixed** — leveled, secret-scrubbing, stderr-only logger.                                           |
| M5  | Server `version` hardcoded `1.0.0`.                                                      | **Fixed** — sourced from `package.json` at runtime.                                                  |

### Info

| ID  | Finding                                                                    | Status                                                                           |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| I1  | No integration/contract tests (all mocked at the function boundary).       | **Fixed** — HTTP-level integration tests + spec contract tier + opt-in live e2e. |
| I2  | Missing primary features: failing pipelines, list tags, cut version.       | **Deferred** — designed below.                                                   |
| I3  | Docs referenced app passwords.                                             | **Fixed** — `.env.example`/docs updated.                                         |
| I4  | No rate-limit/observability surfacing.                                     | Partially addressed (retry + logger).                                            |
| I5  | Bitbucket has **no "Releases"** — cutting a version == creating a git tag. | Documented.                                                                      |

## MCP interface (current, read-only)

`workspace`/`repo` default to `BITBUCKET_WORKSPACE` / `BITBUCKET_DEFAULT_REPO`.
Output is compact JSON, lean fields only (no rendered HTML, short commit hashes,
null/empty omitted), single page + `has_more`/`page` cursor (no auto-pagination).

| Tool                           | Inputs                                                                        | Returns                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `bitbucket_list_pull_requests` | `workspace?`, `repo?`, `state?`(OPEN), `query?`, `sort?`, `page?`, `pagelen?` | `{items[{id,title,state,author,source_branch,dest_branch,comment_count,task_count,updated_on,url}], page, has_more, total}` |
| `bitbucket_get_pull_request`   | `workspace?`, `repo?`, `id*`                                                  | PR + description, reviewers, participants/approvals                                                                         |
| `bitbucket_get_pr_commits`     | `workspace?`, `repo?`, `id*`, `page?`                                         | `{items[{hash,message,author,date}], …}`                                                                                    |
| `bitbucket_get_pr_diff`        | `workspace?`, `repo?`, `id*`, `max_lines?`(200)                               | `{diff, truncated, total_lines, files_changed}`                                                                             |
| `bitbucket_list_pr_comments`   | `workspace?`, `repo?`, `id*`, `page?`                                         | `{items[{id,author,content,created_on,inline,parent_id,deleted}], …}`                                                       |
| `bitbucket_get_comment`        | `workspace?`, `repo?`, `pr_id*`, `comment_id*`                                | single comment                                                                                                              |
| `bitbucket_list_pr_tasks`      | `workspace?`, `repo?`, `id*`, `page?`                                         | `{items[{id,content,state,creator,created_on}], …}`                                                                         |
| `bitbucket_get_task`           | `workspace?`, `repo?`, `pr_id*`, `task_id*`                                   | single task                                                                                                                 |
| `bitbucket_list_branches`      | `workspace?`, `repo?`, `query?`, `sort?`, `page?`                             | `{items[{name,target_hash,target_date,author,message}], …}`                                                                 |
| `bitbucket_get_branch`         | `workspace?`, `repo?`, `name*`                                                | single branch                                                                                                               |

All write tools (merge/approve/decline/comment-create/comment-delete/task-create/
task-update/branch-create) are **removed** from the MCP surface.

## Auth & configuration

| Env var                                         | Required        | Notes                                                                   |
| ----------------------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `BITBUCKET_WORKSPACE`                           | yes             | Workspace ID.                                                           |
| `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`       | yes (canonical) | Basic auth `email:token`; token minted with scopes at id.atlassian.com. |
| `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD` | fallback        | Deprecated; emits a warning; API-token pair wins if both set.           |
| `BITBUCKET_DEFAULT_REPO`                        | no              | Default repo when a tool omits `repo`.                                  |
| `LOG_LEVEL`                                     | no              | `debug`/`info`/`warn`/`error` (default `info`).                         |
| `BITBUCKET_ALLOW_WRITES`                        | no              | Gates future write tools (default off).                                 |

## Testing

| Tier                | Command                      | What it proves                                                                                                                                                     |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit + integration  | `npm test`                   | Logic + a real local-HTTP integration test (axios + auth + retry + pagination + presenters end to end). Fast, hermetic.                                            |
| Contract            | `npm run test:contract`      | Request paths + response shapes + depended-on fields validated against the **vendored Bitbucket OpenAPI spec** (ajv). Own CI job; run manually or in the pipeline. |
| Live e2e (opt-in)   | `BITBUCKET_E2E=1 … npm test` | Hits the real Bitbucket API; skipped by default.                                                                                                                   |
| Security regression | (in `npm test`)              | Token never appears in any serialized error/log; `Secret` redacts.                                                                                                 |

Refresh the vendored spec with `npm run refresh-spec`
(`packages/bitbucket-core/contract/bitbucket-openapi.json`).

## Deferred roadmap (designed, not built)

Verified endpoints from the Bitbucket spec; all confirmed present by the
contract test's roadmap assertions.

| Feature           | Endpoint                                   | Notes                                                                                                                           |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Failing pipelines | `GET …/pipelines?sort=-created_on`         | "failing" = `state.name==COMPLETED && state.result.name ∈ {FAILED,ERROR}`. Detail via `…/pipelines/{uuid}/steps` + step `/log`. |
| List tags         | `GET …/refs/tags?sort=-target.date`        | Surface `name`, `target.hash`, `target.date`, `target.message`, html url.                                                       |
| Cut a version     | `POST …/refs/tags` `{name, target:{hash}}` | Full commit SHA. **No "releases" on Bitbucket — tag only.** Gated behind `BITBUCKET_ALLOW_WRITES` + write-scoped token.         |

**CLI:** `bitbucket-core` already isolates config/operations/presenters so a
`packages/bitbucket-cli` can be a thin adapter (same pattern as the MCP server).
Designed now, built later.
