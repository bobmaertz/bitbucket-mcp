# Bitbucket MCP Server

Read-only [MCP](https://modelcontextprotocol.io/) server for **Bitbucket Cloud** — lets Claude and other LLM clients browse repositories, pull requests, comments, tasks, and branches. Token-sparse output, no write access, credential never leaves the client layer.

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

Environment variables — auth is Basic `email:token`. `LOG_LEVEL` (default `info`) and `BITBUCKET_ALLOW_WRITES` (reserved, off) are optional. The deprecated `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD` pair is accepted as a fallback. See [`.env.example`](./.env.example).

| Variable                                  | Notes                                       |
| ----------------------------------------- | ------------------------------------------- |
| `BITBUCKET_WORKSPACE`                     | Default workspace ID (required).            |
| `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN` | Required. Token minted at id.atlassian.com. |

## Tools

Read-only. `workspace` defaults to `BITBUCKET_WORKSPACE`; repo-scoped tools require `repo`.

| Tool                                | Key inputs                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `bitbucket_list_repositories`       | `workspace?`, `query?`, `sort?`, `page?`                                         |
| `bitbucket_get_repository`          | `workspace?`, `repo`                                                             |
| `bitbucket_list_pull_requests`      | `repo`, `state?` (default `OPEN`), `query?`, `page?`                             |
| `bitbucket_list_user_pull_requests` | `workspace?`, `user?` (default: me), `state?`, `sort?`, `pagelen?`, `max_pages?` |
| `bitbucket_get_pull_request`        | `repo`, `id`                                                                     |
| `bitbucket_get_pr_commits`          | `repo`, `id`, `page?`                                                            |
| `bitbucket_get_pr_diff`             | `repo`, `id`, `max_lines?` (default 200)                                         |
| `bitbucket_list_pr_comments`        | `repo`, `id`, `page?`                                                            |
| `bitbucket_get_comment`             | `repo`, `pr_id`, `comment_id`                                                    |
| `bitbucket_list_pr_tasks`           | `repo`, `id`, `page?`                                                            |
| `bitbucket_get_task`                | `repo`, `pr_id`, `task_id`                                                       |
| `bitbucket_list_branches`           | `repo`, `query?`, `sort?`, `page?`                                               |
| `bitbucket_get_branch`              | `repo`, `name`                                                                   |

`bitbucket_list_repositories` needs no args: omit `workspace` to list the configured `BITBUCKET_WORKSPACE`, or pass `workspace` to scope to another. There is no cross-workspace listing — Atlassian retired both `GET /repositories` and `GET /workspaces` under CHANGE-2770.

`bitbucket_list_user_pull_requests` lists **all pull requests authored by a user across a whole workspace in one aggregated call** — no more listing every repo and querying each. It auto-follows pagination (up to `max_pages`, default 10) and sorts newest-updated first (`-updated_on`). Omit `user` for the authenticated account ("my" PRs); otherwise `user` must be an account UUID (`{…}`) or Atlassian `account_id` — bare usernames were removed by Bitbucket. It covers **authored** PRs only; reviewer-only involvement isn't included. Backed by `GET /workspaces/{workspace}/pullrequests/{selected_user}`.

## Development

Monorepo: **`bitbucket-api`** (REST client) → **`bitbucket-core`** (config, presenters, operations) → **`bitbucket-mcp-server`** (MCP adapter).

```bash
npm install && npm run build
npm test                 # unit + hermetic HTTP integration
npm run test:contract    # validate against the vendored Bitbucket OpenAPI spec
```

Design notes: [docs/ai/DESIGN.md](./docs/ai/DESIGN.md).

## License

MIT
