# Bitbucket MCP Server - Implementation Plan

## Overview

This document outlines the detailed implementation plan for building the Bitbucket MCP Server. The implementation is designed to be executed in parallel by multiple agents, maximizing development efficiency.

## Agent Task Breakdown

### Agent 1: Project Setup & Configuration

**Estimated Time**: 30-45 minutes

#### Tasks

1. Create workspace structure
2. Initialize root package.json with workspace configuration
3. Setup TypeScript configuration (root and base)
4. Create .gitignore
5. Create README.md with setup instructions
6. Setup ESLint and Prettier configurations

#### Files to Create

- `/package.json`
- `/tsconfig.json`
- `/.gitignore`
- `/.eslintrc.json`
- `/.prettierrc.json`
- `/README.md`

#### Deliverables

- Working monorepo structure
- Build scripts configured
- Development environment ready

---

### Agent 2: Bitbucket API Client Core

**Estimated Time**: 1-2 hours

#### Tasks

1. Create `packages/bitbucket-api` structure
2. Implement base HTTP client (`client.ts`)
3. Implement authentication module (`auth.ts`)
4. Create common type definitions (`types/common.ts`)
5. Setup package.json and tsconfig.json for the package
6. Implement error handling utilities
7. Implement pagination helper

#### Files to Create

- `/packages/bitbucket-api/package.json`
- `/packages/bitbucket-api/tsconfig.json`
- `/packages/bitbucket-api/src/index.ts`
- `/packages/bitbucket-api/src/client.ts`
- `/packages/bitbucket-api/src/auth.ts`
- `/packages/bitbucket-api/src/types/common.ts`
- `/packages/bitbucket-api/src/types/index.ts`
- `/packages/bitbucket-api/src/utils/errors.ts`
- `/packages/bitbucket-api/src/utils/pagination.ts`

#### Key Interfaces

```typescript
// client.ts
export class BitbucketClient {
  constructor(config: ClientConfig);
  async request<T>(options: RequestOptions): Promise<T>;
}

// auth.ts
export class AuthHandler {
  getAuthHeader(): string;
}
```

#### Dependencies

- `axios` or `node-fetch`
- `@types/node`

---

### Agent 3: Pull Requests & Comments API

**Estimated Time**: 1.5-2 hours

#### Tasks

1. Define Pull Request types (`types/pullrequest.ts`)
2. Define Comment types (`types/comment.ts`)
3. Implement Pull Requests resource module (`resources/pullrequests.ts`)
4. Implement Comments resource module (`resources/comments.ts`)
5. Add methods to BitbucketClient for PR and comments
6. Write unit tests

#### Files to Create

- `/packages/bitbucket-api/src/types/pullrequest.ts`
- `/packages/bitbucket-api/src/types/comment.ts`
- `/packages/bitbucket-api/src/resources/pullrequests.ts`
- `/packages/bitbucket-api/src/resources/comments.ts`
- `/packages/bitbucket-api/src/resources/index.ts`

#### Key Methods

```typescript
// pullrequests.ts
export class PullRequestsResource {
  async list(workspace, repoSlug, options?);
  async get(workspace, repoSlug, prId);
  async getCommits(workspace, repoSlug, prId);
  async getDiff(workspace, repoSlug, prId);
}

// comments.ts
export class CommentsResource {
  async list(workspace, repoSlug, prId);
  async get(workspace, repoSlug, prId, commentId);
  async create(workspace, repoSlug, prId, content);
  async delete(workspace, repoSlug, prId, commentId);
}
```

---

### Agent 4: Tasks & Branches API

**Estimated Time**: 1-1.5 hours

#### Tasks

1. Define Task types (`types/task.ts`)
2. Define Branch types (`types/branch.ts`)
3. Implement Tasks resource module (`resources/tasks.ts`)
4. Implement Branches resource module (`resources/branches.ts`)
5. Add methods to BitbucketClient for tasks and branches
6. Write unit tests

#### Files to Create

- `/packages/bitbucket-api/src/types/task.ts`
- `/packages/bitbucket-api/src/types/branch.ts`
- `/packages/bitbucket-api/src/resources/tasks.ts`
- `/packages/bitbucket-api/src/resources/branches.ts`

#### Key Methods

```typescript
// tasks.ts
export class TasksResource {
  async list(workspace, repoSlug, prId);
  async get(workspace, repoSlug, prId, taskId);
  async create(workspace, repoSlug, prId, content);
  async update(workspace, repoSlug, prId, taskId, state);
}

// branches.ts
export class BranchesResource {
  async list(workspace, repoSlug, options?);
  async get(workspace, repoSlug, branchName);
  async create(workspace, repoSlug, params);
}
```

---

### Agent 5: MCP Server Core & Configuration

**Estimated Time**: 1-1.5 hours

#### Tasks

1. Create `packages/bitbucket-mcp-server` structure
2. Setup package.json with MCP SDK dependency
3. Implement server initialization (`server.ts`)
4. Implement configuration management (`config.ts`)
5. Create main entry point (`index.ts`)
6. Setup proper stdio transport
7. Implement graceful shutdown

#### Files to Create

- `/packages/bitbucket-mcp-server/package.json`
- `/packages/bitbucket-mcp-server/tsconfig.json`
- `/packages/bitbucket-mcp-server/src/index.ts`
- `/packages/bitbucket-mcp-server/src/server.ts`
- `/packages/bitbucket-mcp-server/src/config.ts`

#### Key Components

```typescript
// server.ts
export function createServer(config: ServerConfig): Server;

// config.ts
export interface ServerConfig {
  workspace: string;
  username: string;
  appPassword: string;
  defaultRepo?: string;
}

export function loadConfig(): ServerConfig;
```

#### Dependencies

- `@modelcontextprotocol/sdk`
- `bitbucket-api` (workspace dependency)

---

### Agent 6: MCP Pull Request Tools

**Estimated Time**: 1-1.5 hours

#### Tasks

1. Implement Pull Request tool handlers
2. Register tools with MCP server
3. Implement input validation
4. Implement error handling
5. Write tool documentation
6. Create resource handlers for PRs

#### Files to Create

- `/packages/bitbucket-mcp-server/src/tools/pullrequests.ts`
- `/packages/bitbucket-mcp-server/src/tools/index.ts`
- `/packages/bitbucket-mcp-server/src/resources/pullrequests.ts`

#### Tools to Implement

- `bitbucket_list_pull_requests`
- `bitbucket_get_pull_request`
- `bitbucket_get_pr_commits`
- `bitbucket_get_pr_diff`

#### Tool Schema Example

```typescript
{
  name: "bitbucket_list_pull_requests",
  description: "List pull requests for a Bitbucket repository",
  inputSchema: {
    type: "object",
    properties: {
      workspace: { type: "string" },
      repo_slug: { type: "string" },
      state: {
        type: "string",
        enum: ["OPEN", "MERGED", "DECLINED"],
        optional: true
      }
    },
    required: ["workspace", "repo_slug"]
  }
}
```

---

### Agent 7: MCP Comment & Task Tools

**Estimated Time**: 1-1.5 hours

#### Tasks

1. Implement Comment tool handlers
2. Implement Task tool handlers
3. Register tools with MCP server
4. Implement input validation
5. Implement error handling
6. Create resource handlers for comments and tasks

#### Files to Create

- `/packages/bitbucket-mcp-server/src/tools/comments.ts`
- `/packages/bitbucket-mcp-server/src/tools/tasks.ts`
- `/packages/bitbucket-mcp-server/src/resources/comments.ts`
- `/packages/bitbucket-mcp-server/src/resources/tasks.ts`

#### Comment Tools

- `bitbucket_list_pr_comments`
- `bitbucket_get_comment`
- `bitbucket_create_comment`
- `bitbucket_delete_comment`

#### Task Tools

- `bitbucket_list_pr_tasks`
- `bitbucket_get_task`
- `bitbucket_create_task`
- `bitbucket_update_task`

---

### Agent 8: MCP Branch Tools & Resources

**Estimated Time**: 45 minutes - 1 hour

#### Tasks

1. Implement Branch tool handlers
2. Register tools with MCP server
3. Implement input validation
4. Create resource handlers for branches
5. Implement resource URI routing

#### Files to Create

- `/packages/bitbucket-mcp-server/src/tools/branches.ts`
- `/packages/bitbucket-mcp-server/src/resources/branches.ts`
- `/packages/bitbucket-mcp-server/src/resources/index.ts`

#### Branch Tools

- `bitbucket_list_branches`
- `bitbucket_get_branch`
- `bitbucket_create_branch`

#### Resource URIs

- `bitbucket://{workspace}/{repo}/branches`
- `bitbucket://{workspace}/{repo}/branches/{name}`

---

## Dependency Graph

```
Agent 1 (Project Setup)
    ↓
Agent 2 (API Core)
    ↓
    ├─→ Agent 3 (PRs & Comments API)
    └─→ Agent 4 (Tasks & Branches API)

Agent 1 + Agent 2
    ↓
Agent 5 (MCP Server Core)
    ↓
    ├─→ Agent 6 (PR Tools)
    ├─→ Agent 7 (Comment & Task Tools)
    └─→ Agent 8 (Branch Tools)
```

## Implementation Phases

### Phase 1: Foundation (Sequential)

**Agents**: 1, 2
**Duration**: 1.5-2.5 hours

Agent 1 must complete first, then Agent 2 can proceed.

### Phase 2: API Resources (Parallel)

**Agents**: 3, 4
**Duration**: 1.5-2 hours

Agents 3 and 4 can work in parallel after Agent 2 completes.

### Phase 3: MCP Server Core (Sequential)

**Agents**: 5
**Duration**: 1-1.5 hours

Agent 5 can start after Agent 2 completes (doesn't need 3 & 4).

### Phase 4: MCP Tools (Parallel)

**Agents**: 6, 7, 8
**Duration**: 1-1.5 hours

Agents 6, 7, and 8 can work in parallel after Agent 5 completes.

## Total Estimated Timeline

- **Sequential execution**: 8-11 hours
- **With maximum parallelization**: 5-7 hours

## Testing Strategy

Each agent should include basic unit tests for their components.

### Agent-Specific Testing

**Agent 2**: HTTP client tests with mocked responses
**Agent 3**: PR and Comment API tests
**Agent 4**: Task and Branch API tests
**Agent 5**: Server initialization tests
**Agents 6-8**: Tool handler tests with mocked API client

### Integration Testing

After all agents complete, run integration tests:

1. Test MCP protocol compliance
2. Test with real Bitbucket API (test workspace)
3. End-to-end tool execution tests

## Environment Setup

### Required Environment Variables

```bash
BITBUCKET_WORKSPACE=test-workspace
BITBUCKET_USERNAME=your-username
BITBUCKET_APP_PASSWORD=your-app-password
BITBUCKET_DEFAULT_REPO=test-repo
```

### Development Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run MCP server
node packages/bitbucket-mcp-server/dist/index.js
```

## Success Criteria

### Agent Completion Checklist

- [ ] Agent 1: Project structure created, builds successfully
- [ ] Agent 2: API client core implemented, authenticates successfully
- [ ] Agent 3: PR and Comment APIs implemented, unit tests pass
- [ ] Agent 4: Task and Branch APIs implemented, unit tests pass
- [ ] Agent 5: MCP server starts and responds to protocol messages
- [ ] Agent 6: PR tools registered and functional
- [ ] Agent 7: Comment and Task tools registered and functional
- [ ] Agent 8: Branch tools registered and functional

### Final Integration Checklist

- [ ] All packages build without errors
- [ ] All unit tests pass
- [ ] MCP server starts without errors
- [ ] Server responds to list_tools request
- [ ] Server responds to list_resources request
- [ ] Can list pull requests from real repository
- [ ] Can retrieve PR comments
- [ ] Can retrieve PR tasks
- [ ] Can list branches
- [ ] Error handling works correctly
- [ ] Documentation is complete

## Code Standards

### TypeScript

- Strict mode enabled
- No `any` types without justification
- Proper error handling with typed errors
- JSDoc comments for public APIs

### Naming Conventions

- Classes: PascalCase
- Functions/methods: camelCase
- Constants: UPPER_SNAKE_CASE
- Interfaces: PascalCase (no "I" prefix)
- Types: PascalCase

### Error Handling

- Use custom error classes
- Provide meaningful error messages
- Log errors appropriately
- Don't swallow errors

### Testing

- Unit test coverage: 80%+
- Test happy paths and error cases
- Mock external dependencies
- Use descriptive test names

## Communication Protocol

Each agent should:

1. Comment on their assigned tasks when starting
2. Report any blockers immediately
3. Update progress regularly
4. Document any deviations from the plan
5. Notify when complete with summary

## Risk Mitigation

### Potential Issues

1. **Bitbucket API Rate Limiting**
   - Solution: Implement retry logic with backoff
   - Test with rate limit handling

2. **Type Changes (int64 for IDs)**
   - Solution: Use `number` in TypeScript (handles int64)
   - Add comments about the change

3. **Authentication Failures**
   - Solution: Clear error messages
   - Validate credentials early

4. **MCP Protocol Changes**
   - Solution: Pin SDK version
   - Follow SDK documentation closely

5. **Package Dependencies**
   - Solution: Use workspace protocol
   - Build packages in correct order

## Next Steps

1. Review and approve this implementation plan
2. Assign agents to tasks
3. Setup communication channels
4. Begin Phase 1 implementation
5. Monitor progress and adjust as needed
