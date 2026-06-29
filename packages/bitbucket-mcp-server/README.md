# @bobmaertz/bitbucket-mcp

Read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for **Bitbucket Cloud** — browse repositories, pull requests, comments, tasks, and branches from Claude and other MCP clients, with lean token-sparse output and no write access.

## Install

No install needed — run it with `npx`. You need a Bitbucket Cloud (Atlassian) **API token granted repository read scopes** (`read:repository:bitbucket`, plus `read:pullrequest:bitbucket` for PRs/comments/tasks) — no write scopes required. Mint one at <https://id.atlassian.com/manage-profile/security/api-tokens>, then add to your MCP client (e.g. `claude_desktop_config.json`):

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

## Configuration

| Variable                                        | Required | Notes                                           |
| ----------------------------------------------- | -------- | ----------------------------------------------- |
| `BITBUCKET_WORKSPACE`                           | ✅       | Default workspace ID.                           |
| `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`       | ✅       | Basic `email:token`.                            |
| `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD` | —        | Deprecated app-password fallback.               |
| `LOG_LEVEL`                                     | —        | `debug`/`info`/`warn`/`error` (default `info`). |

## Tools

Read-only across repositories, pull requests, commits, diffs, comments, tasks, and branches —
`bitbucket_list_repositories`, `bitbucket_get_pull_request`, `bitbucket_get_pr_diff`, and more.
Full tool reference and usage examples: **[github.com/bobmaertz/bitbucket-mcp](https://github.com/bobmaertz/bitbucket-mcp#tools)**.

## License

MIT
