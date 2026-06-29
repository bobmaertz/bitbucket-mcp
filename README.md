# Bitbucket MCP Server

A Model Context Protocol (MCP) server that provides LLM applications with read-only access to Bitbucket Cloud repositories through a standardized interface.

> **Audit & roadmap tracking:** the security/quality audit findings and the feature roadmap are
> tracked on the Todoist **"Bitbucket MCP"** board, not in this repo. This README is the
> reference for the live auth model, tool surface, and tests.

## Overview

This project implements an MCP server for Bitbucket Cloud REST API 2.0, enabling AI assistants like Claude to read Bitbucket repositories, pull requests, comments, tasks, and branches. The current tool surface is **read-only**.

## Architecture

The project is organized as a monorepo with three packages:

- **`bitbucket-api`**: Isolated REST API client for Bitbucket Cloud
- **`bitbucket-core`**: Shared config, logging, presenters, and operations (used by the MCP server and a future CLI)
- **`bitbucket-mcp-server`**: MCP server implementation (thin adapter over `bitbucket-core`)

## Installation

### Prerequisites

- Node.js 18 or higher
- npm
- A Bitbucket Cloud account and an Atlassian API token (see below)

### Setup

```bash
git clone <repository-url>
cd bitbucket-mcp
npm install
npm run build
```

## Configuration

Configuration is via environment variables (12-factor). Authentication uses an **Atlassian API
token** with HTTP Basic auth — the username is your account **email**, the password is the token.
App passwords are deprecated by Atlassian (removal in 2026) and only accepted as a fallback.

Create an API token (with scopes) at
<https://id.atlassian.com/manage-profile/security/api-tokens>.

| Env var                                         | Required        | Notes                                                                   |
| ----------------------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `BITBUCKET_WORKSPACE`                           | yes             | Workspace ID.                                                           |
| `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`       | yes (canonical) | Basic auth `email:token`; token minted with scopes at id.atlassian.com. |
| `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD` | fallback        | Deprecated; emits a warning; API-token pair wins if both set.           |
| `LOG_LEVEL`                                     | no              | `debug`/`info`/`warn`/`error` (default `info`).                         |
| `BITBUCKET_ALLOW_WRITES`                        | no              | Gates future write tools (default off).                                 |

See [`.env.example`](../.env.example) for a template.

### MCP Client Configuration (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/absolute/path/to/bitbucket-mcp/packages/bitbucket-mcp-server/dist/index.js"],
      "env": {
        "BITBUCKET_WORKSPACE": "your-workspace",
        "BITBUCKET_EMAIL": "you@example.com",
        "BITBUCKET_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## MCP Tools (read-only)

`workspace` defaults to `BITBUCKET_WORKSPACE`; `repo` must be passed explicitly to repo-scoped
tools. Output is compact JSON with lean fields only (no rendered HTML, short commit hashes,
null/empty omitted), a single page plus a `has_more`/`page` cursor (no auto-pagination). Write
operations (merge/approve/decline/comment/task/branch creation) are **not** exposed.

| Tool                           | Inputs                                                                                   | Returns                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bitbucket_list_repositories`  | `workspace?`, `role?`(owner/collaborator/member), `query?`, `sort?`, `page?`, `pagelen?` | `{repos[{full_name,slug,workspace,is_private,description,language,project,mainbranch,updated_on,url}], page, has_more, total}` (`repos` is `[]` when none) |
| `bitbucket_get_repository`     | `workspace?`, `repo*`                                                                    | single repository                                                                                                                                          |
| `bitbucket_list_pull_requests` | `workspace?`, `repo*`, `state?`(OPEN), `query?`, `sort?`, `page?`, `pagelen?`            | `{items[{id,title,state,author,source_branch,dest_branch,comment_count,task_count,updated_on,url}], page, has_more, total}`                                |
| `bitbucket_get_pull_request`   | `workspace?`, `repo*`, `id*`                                                             | PR + description, reviewers, participants/approvals                                                                                                        |
| `bitbucket_get_pr_commits`     | `workspace?`, `repo*`, `id*`, `page?`                                                    | `{items[{hash,message,author,date}], …}`                                                                                                                   |
| `bitbucket_get_pr_diff`        | `workspace?`, `repo*`, `id*`, `max_lines?`(200)                                          | `{diff, truncated, total_lines, files_changed}`                                                                                                            |
| `bitbucket_list_pr_comments`   | `workspace?`, `repo*`, `id*`, `page?`                                                    | `{items[{id,author,content,created_on,inline,parent_id,deleted}], …}`                                                                                      |
| `bitbucket_get_comment`        | `workspace?`, `repo*`, `pr_id*`, `comment_id*`                                           | single comment                                                                                                                                             |
| `bitbucket_list_pr_tasks`      | `workspace?`, `repo*`, `id*`, `page?`                                                    | `{items[{id,content,state,creator,created_on}], …}`                                                                                                        |
| `bitbucket_get_task`           | `workspace?`, `repo*`, `pr_id*`, `task_id*`                                              | single task                                                                                                                                                |
| `bitbucket_list_branches`      | `workspace?`, `repo*`, `query?`, `sort?`, `page?`                                        | `{items[{name,target_hash,target_date,author,message}], …}`                                                                                                |
| `bitbucket_get_branch`         | `workspace?`, `repo*`, `name*`                                                           | single branch                                                                                                                                              |

(`*` = required. `bitbucket_list_repositories` needs neither `workspace` nor `repo`: omit
`workspace` to enumerate the workspaces you belong to — optionally filtered by membership
`role` — and aggregate one page of repos from each. Pass `workspace` to page fully through a
single workspace. The top-level cross-workspace `GET /repositories` listing was deprecated by
Atlassian, so discovery goes via `GET /workspaces`.)

### Usage Examples

Once configured with an MCP client like Claude Desktop, ask in natural language:

- "List all the repositories I have access to"
- "List the open pull requests in acme/widgets"
- "Show me the comments on pull request #42"
- "What tasks are open on PR #15?"
- "List the branches and their latest commits"

## Development

### Project Structure

```
bitbucket-mcp/
├── packages/
│   ├── bitbucket-api/          # REST API client (auth, client, resources, types)
│   ├── bitbucket-core/         # Shared config, logging, presenters, operations
│   │   └── contract/           # Vendored Bitbucket OpenAPI spec (contract tests)
│   └── bitbucket-mcp-server/   # MCP server (index.ts, server.ts, tools.ts)
├── docs/
└── package.json                # Root workspace config
```

### Available Scripts

```bash
npm run build          # Build all packages
npm test               # Unit + integration tests
npm run test:contract  # Contract tests against the vendored Bitbucket spec
npm run lint           # ESLint
npm run format         # Prettier
```

### Running the MCP Server

```bash
# Development
cd packages/bitbucket-mcp-server && npm run dev

# Production
node packages/bitbucket-mcp-server/dist/index.js
```

## Testing

| Tier                | Command                      | What it proves                                                                                                          |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Unit + integration  | `npm test`                   | Logic + a real local-HTTP integration test (axios + auth + retry + pagination + presenters end to end). Fast, hermetic. |
| Contract            | `npm run test:contract`      | Request paths + response shapes + depended-on fields validated against the vendored Bitbucket OpenAPI spec (ajv).       |
| Live e2e (opt-in)   | `BITBUCKET_E2E=1 … npm test` | Hits the real Bitbucket API; skipped by default.                                                                        |
| Security regression | (in `npm test`)              | Token never appears in any serialized error/log; the `Secret` wrapper redacts.                                          |

Refresh the vendored spec with `npm run refresh-spec --workspace bitbucket-core`
(`packages/bitbucket-core/contract/bitbucket-openapi.json`).

## Documentation

- [Design Document](./ai/DESIGN.md) — architecture and design decisions (partly historical)
- [Bitbucket REST API](https://developer.atlassian.com/cloud/bitbucket/rest/) — official API docs
- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP specification

## License

MIT
