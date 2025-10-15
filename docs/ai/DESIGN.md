# Bitbucket MCP Server - Design Document

## Project Overview

This project implements a Model Context Protocol (MCP) server for Bitbucket Cloud, enabling LLM applications to interact with Bitbucket repositories through a standardized interface. The architecture follows a clean separation of concerns with an isolated REST API client package.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────┐
│     MCP Client (Claude/LLM)         │
└──────────────┬──────────────────────┘
               │ MCP Protocol
┌──────────────▼──────────────────────┐
│     Bitbucket MCP Server             │
│  - Tool Handlers                     │
│  - Resource Handlers                 │
│  - Protocol Implementation           │
└──────────────┬──────────────────────┘
               │ Internal API
┌──────────────▼──────────────────────┐
│   Bitbucket REST API Client          │
│  - HTTP Client                       │
│  - Authentication                    │
│  - Type Definitions                  │
│  - API Methods                       │
└──────────────┬──────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────┐
│   Bitbucket Cloud REST API 2.0       │
└─────────────────────────────────────┘
```

### Package Structure

```
bitbucket_mcp/
├── packages/
│   ├── bitbucket-api/          # Isolated REST API client
│   │   ├── src/
│   │   │   ├── client.ts       # Main HTTP client
│   │   │   ├── auth.ts         # Authentication handlers
│   │   │   ├── types/          # TypeScript type definitions
│   │   │   │   ├── common.ts
│   │   │   │   ├── pullrequest.ts
│   │   │   │   ├── comment.ts
│   │   │   │   ├── task.ts
│   │   │   │   └── branch.ts
│   │   │   ├── resources/      # API resource modules
│   │   │   │   ├── pullrequests.ts
│   │   │   │   ├── comments.ts
│   │   │   │   ├── tasks.ts
│   │   │   │   └── branches.ts
│   │   │   └── index.ts        # Public exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── bitbucket-mcp-server/   # MCP server implementation
│       ├── src/
│       │   ├── index.ts        # Server entry point
│       │   ├── server.ts       # MCP server setup
│       │   ├── tools/          # MCP tool handlers
│       │   │   ├── pullrequests.ts
│       │   │   ├── comments.ts
│       │   │   ├── tasks.ts
│       │   │   └── branches.ts
│       │   ├── resources/      # MCP resource handlers
│       │   │   └── index.ts
│       │   └── config.ts       # Configuration management
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   └── ai/
│       ├── DESIGN.md           # This document
│       └── IMPLEMENTATION_PLAN.md
├── package.json                # Root package.json (workspace)
├── tsconfig.json               # Root TypeScript config
└── README.md
```

## Component Design

### 1. Bitbucket REST API Client Package (`bitbucket-api`)

**Purpose**: Isolated, reusable client for interacting with Bitbucket Cloud REST API 2.0.

**Key Features**:

- Type-safe TypeScript interfaces for all API resources
- Support for authentication (username/app password, OAuth)
- Modular design with separate resource modules
- Comprehensive error handling
- Automatic pagination handling
- Rate limiting support

**Core Components**:

#### 1.1 HTTP Client (`client.ts`)

- Base HTTP client using `node-fetch` or `axios`
- Request/response interceptors
- Error handling and retry logic
- Base URL configuration: `https://api.bitbucket.org/2.0`

#### 1.2 Authentication (`auth.ts`)

- Basic Auth (username + app password)
- OAuth 2.0 support (future)
- Token management

#### 1.3 Resource Modules

**Pull Requests (`resources/pullrequests.ts`)**

```typescript
interface PullRequestsAPI {
  list(workspace: string, repoSlug: string, options?: ListOptions): Promise<PullRequest[]>;
  get(workspace: string, repoSlug: string, prId: number): Promise<PullRequest>;
  getCommits(workspace: string, repoSlug: string, prId: number): Promise<Commit[]>;
  getDiff(workspace: string, repoSlug: string, prId: number): Promise<string>;
}
```

**Comments (`resources/comments.ts`)**

```typescript
interface CommentsAPI {
  list(workspace: string, repoSlug: string, prId: number): Promise<Comment[]>;
  get(workspace: string, repoSlug: string, prId: number, commentId: number): Promise<Comment>;
  create(
    workspace: string,
    repoSlug: string,
    prId: number,
    content: CommentContent
  ): Promise<Comment>;
  delete(workspace: string, repoSlug: string, prId: number, commentId: number): Promise<void>;
}
```

**Tasks (`resources/tasks.ts`)**

```typescript
interface TasksAPI {
  list(workspace: string, repoSlug: string, prId: number): Promise<Task[]>;
  get(workspace: string, repoSlug: string, prId: number, taskId: number): Promise<Task>;
  create(workspace: string, repoSlug: string, prId: number, content: string): Promise<Task>;
  update(
    workspace: string,
    repoSlug: string,
    prId: number,
    taskId: number,
    state: TaskState
  ): Promise<Task>;
}
```

**Branches (`resources/branches.ts`)**

```typescript
interface BranchesAPI {
  list(workspace: string, repoSlug: string, options?: ListOptions): Promise<Branch[]>;
  get(workspace: string, repoSlug: string, branchName: string): Promise<Branch>;
  create(workspace: string, repoSlug: string, params: CreateBranchParams): Promise<Branch>;
}
```

#### 1.4 Type Definitions

**Common Types (`types/common.ts`)**

```typescript
interface PaginatedResponse<T> {
  size: number;
  page: number;
  pagelen: number;
  next?: string;
  previous?: string;
  values: T[];
}

interface User {
  display_name: string;
  uuid: string;
  links: Links;
}

interface Repository {
  name: string;
  full_name: string;
  uuid: string;
  // ...
}
```

**Pull Request Types (`types/pullrequest.ts`)**

```typescript
interface PullRequest {
  id: number;
  title: string;
  description: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  author: User;
  source: BranchInfo;
  destination: BranchInfo;
  created_on: string;
  updated_on: string;
  comment_count: number;
  task_count: number;
  links: Links;
}
```

**Comment Types (`types/comment.ts`)**

```typescript
interface Comment {
  id: number; // Note: Will be int64 as of August 2025
  content: {
    raw: string;
    markup: string;
    html: string;
  };
  user: User;
  created_on: string;
  updated_on: string;
  inline?: InlineInfo;
  parent?: {
    id: number;
  };
}
```

**Task Types (`types/task.ts`)**

```typescript
interface Task {
  id: number; // Note: Will be int64 as of August 2025
  content: {
    raw: string;
  };
  state: 'UNRESOLVED' | 'RESOLVED';
  creator: User;
  created_on: string;
  updated_on: string;
}
```

**Branch Types (`types/branch.ts`)**

```typescript
interface Branch {
  name: string;
  target: {
    hash: string;
    date: string;
    author: User;
    message: string;
  };
  links: Links;
}
```

### 2. MCP Server Package (`bitbucket-mcp-server`)

**Purpose**: Implements the Model Context Protocol server that exposes Bitbucket functionality to LLM clients.

**Dependencies**:

- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `bitbucket-api`: Internal API client package

**Core Components**:

#### 2.1 Server Setup (`server.ts`)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BitbucketClient } from 'bitbucket-api';

const server = new Server(
  {
    name: 'bitbucket-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);
```

#### 2.2 MCP Tools

MCP tools are callable functions exposed to the LLM. Each tool corresponds to Bitbucket operations.

**Pull Request Tools**:

- `bitbucket_list_pull_requests`: List PRs for a repository
- `bitbucket_get_pull_request`: Get details of a specific PR
- `bitbucket_get_pr_commits`: Get commits in a PR
- `bitbucket_get_pr_diff`: Get diff for a PR

**Comment Tools**:

- `bitbucket_list_pr_comments`: List all comments on a PR
- `bitbucket_get_comment`: Get a specific comment
- `bitbucket_create_comment`: Create a new comment
- `bitbucket_delete_comment`: Delete a comment

**Task Tools**:

- `bitbucket_list_pr_tasks`: List all tasks on a PR
- `bitbucket_get_task`: Get a specific task
- `bitbucket_create_task`: Create a new task
- `bitbucket_update_task`: Update task state (resolve/unresolve)

**Branch Tools**:

- `bitbucket_list_branches`: List repository branches
- `bitbucket_get_branch`: Get details of a specific branch
- `bitbucket_create_branch`: Create a new branch

#### 2.3 MCP Resources

Resources provide read-only access to Bitbucket data with URI-based addressing.

**Resource URIs**:

- `bitbucket://{workspace}/{repo}/pullrequests`
- `bitbucket://{workspace}/{repo}/pullrequests/{pr_id}`
- `bitbucket://{workspace}/{repo}/pullrequests/{pr_id}/comments`
- `bitbucket://{workspace}/{repo}/pullrequests/{pr_id}/tasks`
- `bitbucket://{workspace}/{repo}/branches`

#### 2.4 Configuration (`config.ts`)

Configuration loaded from environment variables:

```typescript
interface Config {
  workspace: string; // BITBUCKET_WORKSPACE
  username: string; // BITBUCKET_USERNAME
  appPassword: string; // BITBUCKET_APP_PASSWORD
  defaultRepo?: string; // BITBUCKET_DEFAULT_REPO
}
```

## API Endpoints Reference

### Bitbucket Cloud REST API 2.0 Endpoints Used

**Pull Requests**:

- `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests`
- `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}`
- `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/commits`
- `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/diff`
- `POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests`

**Comments**:

- `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments`
- `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}`
- `POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments`
- `DELETE /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}`

**Tasks**:

- Tasks are typically embedded in comments with specific attributes
- Access via comment endpoints with task filtering

**Branches**:

- `GET /2.0/repositories/{workspace}/{repo_slug}/refs/branches`
- `GET /2.0/repositories/{workspace}/{repo_slug}/refs/branches/{branch_name}`
- `POST /2.0/repositories/{workspace}/{repo_slug}/refs/branches`

## Technology Stack

### Runtime & Language

- **Node.js**: v18+ (LTS)
- **TypeScript**: v5.x
- **Package Manager**: npm or pnpm

### Core Dependencies

**Bitbucket API Package**:

- `axios` or `node-fetch`: HTTP client
- `zod`: Runtime type validation (optional)

**MCP Server Package**:

- `@modelcontextprotocol/sdk`: ^1.0.0
- `bitbucket-api`: workspace:\*

### Development Dependencies

- `typescript`: ^5.x
- `@types/node`: ^18.x
- `tsx`: TypeScript execution
- `eslint`: Code linting
- `prettier`: Code formatting
- `vitest` or `jest`: Testing framework

## Configuration & Setup

### Environment Variables

```bash
# Required
BITBUCKET_WORKSPACE=your-workspace
BITBUCKET_USERNAME=your-username
BITBUCKET_APP_PASSWORD=your-app-password

# Optional
BITBUCKET_DEFAULT_REPO=your-default-repo
LOG_LEVEL=info
```

### MCP Client Configuration

Example configuration for Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/path/to/bitbucket_mcp/packages/bitbucket-mcp-server/dist/index.js"],
      "env": {
        "BITBUCKET_WORKSPACE": "your-workspace",
        "BITBUCKET_USERNAME": "your-username",
        "BITBUCKET_APP_PASSWORD": "your-app-password"
      }
    }
  }
}
```

## Implementation Strategy

### Phase 1: REST API Client Package

1. Setup package structure and TypeScript configuration
2. Implement base HTTP client with authentication
3. Define TypeScript types for all resources
4. Implement Pull Requests API
5. Implement Comments API
6. Implement Tasks API
7. Implement Branches API
8. Add error handling and pagination support
9. Write unit tests

### Phase 2: MCP Server Package

1. Setup package structure and dependencies
2. Implement MCP server initialization
3. Implement Pull Request tools
4. Implement Comment tools
5. Implement Task tools
6. Implement Branch tools
7. Implement resource handlers
8. Add configuration management
9. Write integration tests

### Phase 3: Integration & Testing

1. End-to-end testing with real Bitbucket API
2. Documentation and examples
3. Performance optimization
4. Error handling improvements

## Parallel Implementation Plan

The following tasks can be implemented in parallel by different agents:

### Agent 1: Project Setup & API Client Core

- Setup workspace structure
- Create root configuration files
- Implement HTTP client and authentication
- Define common types

### Agent 2: Pull Requests & Comments API

- Implement Pull Requests resource module
- Implement Comments resource module
- Create corresponding type definitions

### Agent 3: Tasks & Branches API

- Implement Tasks resource module
- Implement Branches resource module
- Create corresponding type definitions

### Agent 4: MCP Server Core & PR Tools

- Setup MCP server structure
- Implement server initialization
- Implement Pull Request tools
- Implement resource handlers for PRs

### Agent 5: MCP Comment & Task Tools

- Implement Comment tools
- Implement Task tools
- Implement resource handlers for comments/tasks

### Agent 6: MCP Branch Tools & Configuration

- Implement Branch tools
- Implement configuration management
- Create environment setup documentation

## Error Handling Strategy

### API Client Error Handling

- Network errors: Retry with exponential backoff
- Authentication errors: Clear error messages
- Rate limiting: Respect API limits and retry after delay
- 404 errors: Return null or throw NotFoundError
- Validation errors: Throw with detailed messages

### MCP Server Error Handling

- Invalid parameters: Return error to client with details
- API client errors: Catch and convert to MCP error format
- Configuration errors: Fail fast with clear messages

## Security Considerations

1. **Credential Management**:
   - Never log credentials
   - Use environment variables
   - Support app passwords (not main passwords)

2. **Input Validation**:
   - Validate all inputs before API calls
   - Sanitize user-provided content

3. **API Permissions**:
   - Document required Bitbucket permissions
   - Use minimal required scopes

## Testing Strategy

### Unit Tests

- API client methods with mocked HTTP responses
- Type validation
- Error handling paths

### Integration Tests

- Real API calls (with test workspace)
- MCP protocol compliance
- End-to-end tool execution

### Test Coverage Goals

- 80%+ code coverage
- All critical paths tested
- Error scenarios covered

## Future Enhancements

1. **Additional Resources**:
   - Commits
   - Files/Source code
   - Pipeline/CI information
   - Issues

2. **Write Operations**:
   - Create/update/merge PRs
   - Approve PRs
   - Create/update branches

3. **Advanced Features**:
   - Webhooks support
   - Real-time updates
   - Caching layer
   - OAuth 2.0 flow

4. **Performance**:
   - Request batching
   - Response caching
   - Connection pooling

## Success Criteria

1. Successfully list pull requests from a Bitbucket repository
2. Retrieve and display PR comments
3. Retrieve and display PR tasks
4. List repository branches
5. MCP protocol compliance verified
6. Type-safe API with comprehensive TypeScript definitions
7. Clean separation between API client and MCP server
8. Comprehensive error handling
9. Complete documentation

## References

- [Bitbucket Cloud REST API Documentation](https://developer.atlassian.com/cloud/bitbucket/rest/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
