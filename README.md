# Bitbucket MCP Server

Read-only [MCP](https://modelcontextprotocol.io/) server for **Bitbucket Cloud** — lets Claude and other LLM clients browse repositories, source files, commits, pull requests, comments, tasks, branches, tags, CI statuses, pipelines, deployments, projects, and workspaces. Token-sparse output, no write access, credential never leaves the client layer.

## Quickstart

You need a Bitbucket Cloud (Atlassian) **API token with repository read scopes** (`read:repository:bitbucket`, plus `read:pullrequest:bitbucket` for PRs/comments/tasks) — no write scopes. Mint one at <https://id.atlassian.com/manage-profile/security/api-tokens>, then add to your MCP client (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "@bobmaertz/bitbucket-mcp"],
      "env": {
        "BITBUCKET_WORKSPACE": "your-workspace",
        "BITBUCKET_EMAIL": "you@example.com",
        "BITBUCKET_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

Then ask: _"List the open PRs in acme/widgets"_ · _"Show the comments on PR #42"_.

## Configuration

Environment variables. `LOG_LEVEL` (default `info`) and `BITBUCKET_ALLOW_WRITES` (reserved, off) are optional. See [`.env.example`](./.env.example).

Auth is resolved in precedence order: an **access token** (Bearer) wins, then the **API-token** pair (Basic), then the deprecated **app-password** pair (Basic). Supplying `BITBUCKET_ACCESS_TOKEN` is recommended for shared/automated use — workspace, project, and repository [Access Tokens](https://support.atlassian.com/bitbucket-cloud/docs/access-tokens/) get Bitbucket's _scaled_ rate limits (up to 10,000 req/hr vs 1,000 for a user API token). The server also surfaces a warning to stderr when Bitbucket signals the quota is nearly exhausted (`X-RateLimit-NearLimit`).

| Variable                                        | Notes                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `BITBUCKET_WORKSPACE`                           | Default workspace ID (required).                                                       |
| `BITBUCKET_ACCESS_TOKEN`                        | Workspace/project/repo Access Token (Bearer). Preferred; scaled rate limits.           |
| `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`       | User API token (Basic). Minted at id.atlassian.com. Used when no access token is set.  |
| `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD` | Deprecated app-password fallback. App Passwords are being removed by Atlassian (2026). |

## Tools

Read-only. `workspace` defaults to `BITBUCKET_WORKSPACE`; repo-scoped tools require `repo`.

| Tool                                  | Key inputs                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `bitbucket_list_repositories`         | `workspace?`, `query?`, `sort?`, `page?`                                            |
| `bitbucket_get_repository`            | `workspace?`, `repo`                                                                |
| `bitbucket_list_pull_requests`        | `repo`, `state?` (default `OPEN`), `query?`, `page?`                                |
| `bitbucket_list_user_pull_requests`   | `workspace?`, `user?` (default: me), `state?`, `sort?`, `pagelen?`, `max_pages?`    |
| `bitbucket_get_pull_request`          | `repo`, `id`                                                                        |
| `bitbucket_get_pr_commits`            | `repo`, `id`, `page?`                                                               |
| `bitbucket_get_pr_diff`               | `repo`, `id`, `max_lines?` (default 200), `path?`, `context?`                       |
| `bitbucket_list_pr_comments`          | `repo`, `id`, `page?`                                                               |
| `bitbucket_get_comment`               | `repo`, `pr_id`, `comment_id`                                                       |
| `bitbucket_list_pr_tasks`             | `repo`, `id`, `page?`                                                               |
| `bitbucket_get_task`                  | `repo`, `pr_id`, `task_id`                                                          |
| `bitbucket_list_branches`             | `repo`, `query?`, `sort?`, `page?`                                                  |
| `bitbucket_get_branch`                | `repo`, `name`                                                                      |
| `bitbucket_list_pipelines`            | `repo`, `branch?`, `pull_request_id?`, `status?`, `sort?`, `page?`                  |
| `bitbucket_get_pipeline`              | `repo`, `pipeline` (build number or UUID)                                           |
| `bitbucket_list_pipeline_steps`       | `repo`, `pipeline`, `page?`                                                         |
| `bitbucket_get_step_log`              | `repo`, `pipeline`, `step`, `tail?`, `grep?`, `max_bytes?`                          |
| `bitbucket_list_schedules`            | `repo`, `page?`                                                                     |
| `bitbucket_list_directory`            | `repo`, `commit?` (default main), `path?`, `max_depth?`, `query?`, `sort?`, `page?` |
| `bitbucket_get_file`                  | `repo`, `path`, `commit?` (default main), `max_lines?`, `max_bytes?`                |
| `bitbucket_get_file_history`          | `repo`, `path`, `commit?` (default main), `renames?`, `page?`                       |
| `bitbucket_list_commits`              | `repo`, `at?`, `path?`, `page?`                                                     |
| `bitbucket_get_commit`                | `repo`, `commit`                                                                    |
| `bitbucket_get_commit_diff`           | `repo`, `spec` (hash or `a..b`), `max_lines?`, `path?`, `context?`                  |
| `bitbucket_get_diffstat`              | `repo`, `spec` (hash or `a..b`), `path?`, `page?`                                   |
| `bitbucket_list_tags`                 | `repo`, `query?`, `sort?`, `page?`                                                  |
| `bitbucket_get_tag`                   | `repo`, `name`                                                                      |
| `bitbucket_get_pr_diffstat`           | `repo`, `id`, `page?`                                                               |
| `bitbucket_list_pr_statuses`          | `repo`, `id`, `query?`, `sort?`, `page?`                                            |
| `bitbucket_list_commit_statuses`      | `repo`, `commit`, `page?`                                                           |
| `bitbucket_get_pr_activity`           | `repo`, `id`, `page?`                                                               |
| `bitbucket_list_commit_pull_requests` | `repo`, `commit`, `page?`                                                           |
| `bitbucket_get_test_reports`          | `repo`, `pipeline` (build number or UUID), `step`                                   |
| `bitbucket_list_workspaces`           | `page?`                                                                             |
| `bitbucket_list_projects`             | `workspace?`, `query?`, `sort?`, `page?`                                            |
| `bitbucket_get_project`               | `workspace?`, `key`                                                                 |
| `bitbucket_list_deployments`          | `repo`, `page?`                                                                     |
| `bitbucket_list_environments`         | `repo`, `page?`                                                                     |
| `bitbucket_get_branching_model`       | `repo`                                                                              |
| `bitbucket_list_workspace_members`    | `workspace?`, `page?`                                                               |

`bitbucket_list_repositories` needs no args: omit `workspace` to list the configured `BITBUCKET_WORKSPACE`, or pass `workspace` to scope to another. There is no cross-workspace listing — Atlassian retired both `GET /repositories` and `GET /workspaces` under CHANGE-2770.

`bitbucket_list_user_pull_requests` lists **all pull requests authored by a user across a whole workspace in one aggregated call** — no more listing every repo and querying each. It auto-follows pagination (up to `max_pages`, default 10) and sorts newest-updated first (`-updated_on`). Omit `user` for the authenticated account ("my" PRs); otherwise `user` must be an account UUID (`{…}`) or Atlassian `account_id` — bare usernames were removed by Bitbucket. It covers **authored** PRs only; reviewer-only involvement isn't included. Backed by `GET /workspaces/{workspace}/pullrequests/{selected_user}`.

`bitbucket_get_pr_diff` scopes the diff server-side: pass `path` (one or more files) and/or `context` (lines around each hunk) to fetch just what you need instead of downloading the whole diff and trimming it.

The source and commit tools give an agent eyes on the repository. `bitbucket_list_directory` and `bitbucket_get_file` default `commit` to the repo's main branch (and echo the resolved `ref`), so you can browse without knowing the default branch; use `max_depth` to pull a recursive tree in one call. `bitbucket_get_file` caps content by `max_bytes`/`max_lines` and returns `binary: true` (no content) for binary files. For "what changed", prefer `bitbucket_get_diffstat` (a cheap per-file summary) before pulling `bitbucket_get_commit_diff`, which supports the same `path`/`context` scoping as the PR diff.

For CI, `bitbucket_list_pr_statuses` and `bitbucket_list_commit_statuses` surface build/check results from any reporting system (not just Bitbucket Pipelines), and `bitbucket_get_test_reports` turns a failed pipeline step into a summary of pass/fail counts plus the named failing tests and their failure reasons — no log grepping. `bitbucket_get_pr_activity` gives a normalized timeline of updates, approvals, change requests, and comments, and `bitbucket_list_commit_pull_requests` answers "which PR introduced this commit?".

For discovery and governance, `bitbucket_list_workspaces` finds the workspace IDs you can pass elsewhere, `bitbucket_list_projects` / `bitbucket_get_project` and `bitbucket_list_workspace_members` cover project and membership metadata, `bitbucket_list_deployments` / `bitbucket_list_environments` give release visibility, and `bitbucket_get_branching_model` reports the repo's development/production branch conventions.

### Efficiency

Every list/get request asks Bitbucket for a [partial response](https://developer.atlassian.com/cloud/bitbucket/rest/intro/#partial-responses) (`fields=`) matching exactly what the presenter keeps, so the payload is trimmed at the source rather than after download. Step logs are tailed with an HTTP `Range` request (only the last window of bytes is transferred unless you `grep`, which scans the whole log). Combined with per-request field selection and `q`/`sort` filtering, this keeps both token usage and API round-trips low — important against Bitbucket's hourly [rate limits](https://support.atlassian.com/bitbucket-cloud/docs/api-request-limits/).

## Development

Monorepo: **`bitbucket-api`** (REST client) → **`bitbucket-core`** (config, presenters, operations) → **`bitbucket-mcp-server`** (MCP adapter).

```bash
npm install && npm run build
npm test                 # unit + hermetic HTTP integration
npm run test:contract    # validate against the vendored Bitbucket OpenAPI spec
```

API audit and roadmap: [docs/API_AUDIT_AND_ROADMAP.md](./docs/API_AUDIT_AND_ROADMAP.md).

## License

MIT
