# Getting Started with Bitbucket MCP Server

This guide will help you set up and start using the Bitbucket MCP Server.

## Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)
- A Bitbucket Cloud account
- Bitbucket app password (instructions below)

## Installation

### 1. Install Dependencies

```bash
cd bitbucket_mcp
npm install
```

### 2. Build the Project

```bash
npm run build
```

This will compile both packages:

- `packages/bitbucket-api` - The REST API client
- `packages/bitbucket-mcp-server` - The MCP server

## Configuration

### Create a Bitbucket App Password

1. Log in to Bitbucket Cloud
2. Click on your profile picture (bottom left)
3. Go to **Personal settings**
4. Click on **App passwords** under Access management
5. Click **Create app password**
6. Give it a label (e.g., "MCP Server")
7. Select the following permissions:
   - **Account**: Read
   - **Workspace membership**: Read
   - **Projects**: Read
   - **Repositories**: Read, Write
   - **Pull requests**: Read, Write
   - **Issues**: Read (optional, for tasks)
8. Click **Create** and copy the generated password

**Important**: Save this password immediately - you won't be able to see it again!

### Set Up Environment Variables

Create a `.env` file in the root directory (optional, or set via your MCP client):

```bash
BITBUCKET_WORKSPACE=your-workspace-name
BITBUCKET_USERNAME=your-bitbucket-username
BITBUCKET_APP_PASSWORD=your-app-password
BITBUCKET_DEFAULT_REPO=your-default-repo-slug
```

**Finding your workspace name:**

- Go to your Bitbucket dashboard
- The URL will be: `https://bitbucket.org/{workspace-name}/`
- Use the workspace name (not the display name)

**Finding your repository slug:**

- Go to your repository
- The URL will be: `https://bitbucket.org/{workspace}/{repo-slug}/`
- Use the repo slug from the URL

## Using with Claude Desktop

### 1. Locate Your Claude Desktop Config

The config file location depends on your operating system:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 2. Add the MCP Server Configuration

Open the config file and add the Bitbucket server:

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/absolute/path/to/bitbucket_mcp/packages/bitbucket-mcp-server/dist/index.js"],
      "env": {
        "BITBUCKET_WORKSPACE": "your-workspace-name",
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password",
        "BITBUCKET_DEFAULT_REPO": "your-default-repo"
      }
    }
  }
}
```

**Important**: Replace `/absolute/path/to/bitbucket_mcp` with the actual absolute path to this directory.

To find the absolute path:

```bash
# In the bitbucket_mcp directory:
pwd
```

### 3. Restart Claude Desktop

Close and reopen Claude Desktop for the changes to take effect.

### 4. Verify the Connection

In Claude Desktop, you should now be able to use Bitbucket tools. Try:

> "List all open pull requests in my repository"

or

> "Show me the comments on pull request #5"

## Available Tools

The MCP server exposes the following tools:

### Pull Request Tools

- `bitbucket_list_pull_requests` - List PRs in a repository
- `bitbucket_get_pull_request` - Get details of a specific PR
- `bitbucket_get_pr_commits` - Get commits in a PR
- `bitbucket_get_pr_diff` - Get the diff for a PR

### Comment Tools

- `bitbucket_list_pr_comments` - List all comments on a PR
- `bitbucket_get_comment` - Get a specific comment
- `bitbucket_create_comment` - Create a new comment
- `bitbucket_delete_comment` - Delete a comment

### Task Tools

- `bitbucket_list_pr_tasks` - List all tasks on a PR
- `bitbucket_get_task` - Get a specific task
- `bitbucket_create_task` - Create a new task
- `bitbucket_update_task` - Update task state (resolve/unresolve)

### Branch Tools

- `bitbucket_list_branches` - List repository branches
- `bitbucket_get_branch` - Get details of a specific branch
- `bitbucket_create_branch` - Create a new branch

## Example Usage

Once configured, you can interact with your Bitbucket repositories using natural language:

### Listing Pull Requests

> "Show me all open pull requests in the main repository"

> "What are the recently merged PRs?"

### Viewing PR Details

> "Get the details of pull request #42"

> "Show me the commits in PR #15"

> "What's the diff for pull request #8?"

### Working with Comments

> "List all comments on PR #20"

> "Add a comment to PR #10 saying 'LGTM! Ready to merge.'"

> "Delete comment #12345 from PR #10"

### Managing Tasks

> "What tasks are on PR #5?"

> "Create a task on PR #7 to update the documentation"

> "Mark task #9876 as resolved on PR #7"

### Branch Operations

> "List all branches in the repository"

> "Show me the details of the 'feature/new-ui' branch"

> "Create a new branch called 'hotfix/bug-123' from commit abc123def456"

## Troubleshooting

### Server Not Starting

1. Check that Node.js is installed and version 18+:

   ```bash
   node --version
   ```

2. Verify the build was successful:

   ```bash
   npm run build
   ```

3. Check for TypeScript errors in the build output

### Authentication Errors

1. Verify your app password is correct
2. Make sure you're using an **app password**, not your main Bitbucket password
3. Check that your username is correct (case-sensitive)
4. Verify the app password has the required permissions

### Cannot Find Repository

1. Make sure the workspace name is correct
2. Verify the repository slug matches the URL
3. Check that you have access to the repository
4. Ensure the repository exists in the specified workspace

### Claude Desktop Doesn't Show Bitbucket Tools

1. Verify the config file path is correct
2. Check that the absolute path to `index.js` is correct
3. Restart Claude Desktop
4. Check Claude Desktop logs for errors:
   - **macOS**: `~/Library/Logs/Claude/`
   - **Windows**: `%APPDATA%\Claude\logs\`
   - **Linux**: `~/.config/Claude/logs/`

### Testing the Server Manually

You can test the server directly:

```bash
cd packages/bitbucket-mcp-server
BITBUCKET_WORKSPACE=your-workspace \
BITBUCKET_USERNAME=your-username \
BITBUCKET_APP_PASSWORD=your-password \
npm run dev
```

The server should start and output:

```
Bitbucket MCP Server running on stdio
```

Press `Ctrl+C` to stop.

## Development

### Running in Development Mode

```bash
cd packages/bitbucket-mcp-server
npm run dev
```

### Rebuilding After Changes

```bash
npm run build
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Code Formatting

```bash
npm run format
```

## Project Structure

```
bitbucket_mcp/
├── packages/
│   ├── bitbucket-api/          # REST API client library
│   │   ├── src/
│   │   │   ├── client.ts       # HTTP client
│   │   │   ├── auth.ts         # Authentication
│   │   │   ├── types/          # TypeScript types
│   │   │   └── resources/      # API resource modules
│   │   └── dist/               # Compiled JavaScript
│   │
│   └── bitbucket-mcp-server/   # MCP server
│       ├── src/
│       │   ├── index.ts        # Entry point
│       │   ├── server.ts       # Server setup
│       │   ├── config.ts       # Configuration
│       │   └── tools/          # Tool implementations
│       └── dist/               # Compiled JavaScript
│
├── docs/ai/                    # Design documents
├── package.json                # Root package configuration
└── README.md                   # Project overview
```

## Security Best Practices

1. **Never commit your app password** - Add `.env` to `.gitignore`
2. **Use app passwords, not your main password** - App passwords can be revoked individually
3. **Limit permissions** - Only grant the permissions the server needs
4. **Rotate passwords regularly** - Create new app passwords periodically
5. **Don't share app passwords** - Each user/system should have its own

## Next Steps

- Read the [Design Document](docs/ai/DESIGN.md) for architectural details
- Check the [Implementation Plan](docs/ai/IMPLEMENTATION_PLAN.md) for development roadmap
- Explore the [README](README.md) for API reference
- Review Bitbucket REST API docs: https://developer.atlassian.com/cloud/bitbucket/rest/

## Getting Help

- Check the [README](README.md) for detailed API documentation
- Review the [Design Document](docs/ai/DESIGN.md) for architecture
- Open an issue on GitHub (if applicable)
- Check Bitbucket API status: https://bitbucket.status.atlassian.com/

## License

MIT
