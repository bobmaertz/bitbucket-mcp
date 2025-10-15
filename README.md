# Bitbucket MCP Server

A Model Context Protocol (MCP) server that provides LLM applications with access to Bitbucket Cloud repositories through a standardized interface.

## Overview

This project implements an MCP server for Bitbucket Cloud REST API 2.0, enabling AI assistants like Claude to interact with Bitbucket repositories, pull requests, comments, tasks, and branches.

## Architecture

The project is organized as a monorepo with two main packages:

- **`bitbucket-api`**: Isolated REST API client for Bitbucket Cloud
- **`bitbucket-mcp-server`**: MCP server implementation using the API client

## Features

### Supported Operations

#### Pull Requests

- List pull requests for a repository
- Get details of a specific pull request
- Get commits in a pull request
- Get diff for a pull request

#### Comments

- List all comments on a pull request
- Get a specific comment
- Create new comments
- Delete comments

#### Tasks

- List all tasks on a pull request
- Get a specific task
- Create new tasks
- Update task state (resolve/unresolve)

#### Branches

- List repository branches
- Get details of a specific branch
- Create new branches

## Installation

### Prerequisites

- Node.js 18 or higher
- npm or pnpm
- Bitbucket Cloud account with app password

### Setup

1. Clone the repository:

```bash
git clone <repository-url>
cd bitbucket_mcp
```

2. Install dependencies:

```bash
npm install
```

3. Build the packages:

```bash
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file or set the following environment variables:

```bash
# Required
BITBUCKET_WORKSPACE=your-workspace
BITBUCKET_USERNAME=your-username
BITBUCKET_APP_PASSWORD=your-app-password

# Optional
BITBUCKET_DEFAULT_REPO=your-default-repo
LOG_LEVEL=info
```

### Creating a Bitbucket App Password

1. Go to Bitbucket Settings > Personal Bitbucket settings > App passwords
2. Click "Create app password"
3. Give it a label (e.g., "MCP Server")
4. Select the required permissions:
   - **Repositories**: Read, Write
   - **Pull requests**: Read, Write
   - **Issues**: Read (if using tasks)
5. Copy the generated password

### MCP Client Configuration

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/absolute/path/to/bitbucket_mcp/packages/bitbucket-mcp-server/dist/index.js"],
      "env": {
        "BITBUCKET_WORKSPACE": "your-workspace",
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
      }
    }
  }
}
```

## Development

### Project Structure

```
bitbucket_mcp/
├── packages/
│   ├── bitbucket-api/          # REST API client package
│   │   ├── src/
│   │   │   ├── client.ts       # HTTP client
│   │   │   ├── auth.ts         # Authentication
│   │   │   ├── types/          # TypeScript types
│   │   │   └── resources/      # API resources
│   │   └── package.json
│   │
│   └── bitbucket-mcp-server/   # MCP server package
│       ├── src/
│       │   ├── index.ts        # Entry point
│       │   ├── server.ts       # Server setup
│       │   ├── tools/          # MCP tools
│       │   └── resources/      # MCP resources
│       └── package.json
│
├── docs/
│   └── ai/
│       ├── DESIGN.md           # Design document
│       └── IMPLEMENTATION_PLAN.md
└── package.json                # Root workspace config
```

### Available Scripts

```bash
# Build all packages
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Clean build artifacts
npm run clean
```

### Running the MCP Server

For development:

```bash
cd packages/bitbucket-mcp-server
npm run dev
```

For production:

```bash
node packages/bitbucket-mcp-server/dist/index.js
```

## Usage Examples

Once configured with an MCP client like Claude Desktop, you can use natural language to interact with Bitbucket:

- "List all open pull requests in the main repository"
- "Show me the comments on pull request #42"
- "What tasks are pending on PR #15?"
- "List all branches in the repository"
- "Create a comment on PR #10 saying 'Looks good to me!'"

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

Set up test environment variables and run:

```bash
npm run test:integration
```

## Documentation

- [Design Document](./docs/ai/DESIGN.md) - Detailed architecture and design decisions
- [Implementation Plan](./docs/ai/IMPLEMENTATION_PLAN.md) - Development roadmap and task breakdown
- [Bitbucket REST API](https://developer.atlassian.com/cloud/bitbucket/rest/) - Official API documentation
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification

## MCP Tools Reference

### Pull Request Tools

#### `bitbucket_list_pull_requests`

List pull requests for a repository.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `state` (string, optional): Filter by state (OPEN, MERGED, DECLINED)

#### `bitbucket_get_pull_request`

Get details of a specific pull request.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `pr_id` (number, required): Pull request ID

#### `bitbucket_get_pr_commits`

Get commits in a pull request.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `pr_id` (number, required): Pull request ID

#### `bitbucket_get_pr_diff`

Get diff for a pull request.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `pr_id` (number, required): Pull request ID

### Comment Tools

#### `bitbucket_list_pr_comments`

List all comments on a pull request.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `pr_id` (number, required): Pull request ID

#### `bitbucket_create_comment`

Create a new comment on a pull request.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `pr_id` (number, required): Pull request ID
- `content` (string, required): Comment content (markdown supported)

### Task Tools

#### `bitbucket_list_pr_tasks`

List all tasks on a pull request.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `pr_id` (number, required): Pull request ID

#### `bitbucket_update_task`

Update a task's state.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `pr_id` (number, required): Pull request ID
- `task_id` (number, required): Task ID
- `state` (string, required): New state (RESOLVED, UNRESOLVED)

### Branch Tools

#### `bitbucket_list_branches`

List repository branches.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug

#### `bitbucket_get_branch`

Get details of a specific branch.

**Parameters:**

- `workspace` (string, required): Bitbucket workspace ID
- `repo_slug` (string, required): Repository slug
- `branch_name` (string, required): Branch name

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT

## Support

For issues and questions:

- GitHub Issues: [Project Issues](https://github.com/your-repo/issues)
- Bitbucket API Docs: https://developer.atlassian.com/cloud/bitbucket/rest/
- MCP Documentation: https://modelcontextprotocol.io/

## Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Powered by [Bitbucket Cloud REST API 2.0](https://developer.atlassian.com/cloud/bitbucket/rest/)
