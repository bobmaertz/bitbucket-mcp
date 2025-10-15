import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerPullRequestTools,
  handleListPullRequests,
  handleGetPullRequest,
  handleGetPRCommits,
  handleGetPRDiff,
} from './pullrequests.js';
import type { ToolContext } from '../server.js';

describe('Pull Request Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      bitbucket: {
        pullRequests: {
          list: vi.fn(),
          get: vi.fn(),
          getCommits: vi.fn(),
          getDiff: vi.fn(),
        },
      } as any,
      config: {
        workspace: 'default-workspace',
        username: 'user',
        appPassword: 'pass',
        defaultRepo: 'default-repo',
        logLevel: 'info',
      },
    };
  });

  describe('registerPullRequestTools', () => {
    it('should register all pull request tools', () => {
      const tools = registerPullRequestTools();

      expect(tools).toHaveLength(4);
      expect(tools.map((t) => t.name)).toEqual([
        'bitbucket_list_pull_requests',
        'bitbucket_get_pull_request',
        'bitbucket_get_pr_commits',
        'bitbucket_get_pr_diff',
      ]);
    });

    it('should have proper input schemas', () => {
      const tools = registerPullRequestTools();

      tools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe('handleListPullRequests', () => {
    it('should list pull requests with default workspace and repo', async () => {
      const mockResponse = {
        values: [
          {
            id: 1,
            title: 'Test PR',
            state: 'OPEN',
            author: { display_name: 'Alice' },
            created_on: '2024-01-01',
            updated_on: '2024-01-02',
            source: { branch: { name: 'feature' } },
            destination: { branch: { name: 'main' } },
            comment_count: 5,
            task_count: 2,
          },
        ],
        size: 1,
      };

      (mockContext.bitbucket.pullRequests.list as any).mockResolvedValue(mockResponse);

      const result = await handleListPullRequests(mockContext, {});

      expect(mockContext.bitbucket.pullRequests.list).toHaveBeenCalledWith(
        'default-workspace',
        'default-repo',
        {}
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toHaveProperty('pull_requests');
    });

    it('should use custom workspace and repo if provided', async () => {
      const mockResponse = { values: [], size: 0 };
      (mockContext.bitbucket.pullRequests.list as any).mockResolvedValue(mockResponse);

      await handleListPullRequests(mockContext, {
        workspace: 'custom-workspace',
        repo_slug: 'custom-repo',
      });

      expect(mockContext.bitbucket.pullRequests.list).toHaveBeenCalledWith(
        'custom-workspace',
        'custom-repo',
        {}
      );
    });

    it('should filter by state', async () => {
      const mockResponse = { values: [], size: 0 };
      (mockContext.bitbucket.pullRequests.list as any).mockResolvedValue(mockResponse);

      await handleListPullRequests(mockContext, {
        state: 'MERGED',
      });

      expect(mockContext.bitbucket.pullRequests.list).toHaveBeenCalledWith(
        'default-workspace',
        'default-repo',
        { state: 'MERGED' }
      );
    });

    it('should throw error if repo_slug is not provided and no default', async () => {
      mockContext.config.defaultRepo = undefined;

      await expect(handleListPullRequests(mockContext, {})).rejects.toThrow(
        'repo_slug is required'
      );
    });
  });

  describe('handleGetPullRequest', () => {
    it('should get a specific pull request', async () => {
      const mockPR = {
        id: 1,
        title: 'Test PR',
        description: 'Description',
        state: 'OPEN',
        author: { display_name: 'Alice' },
        created_on: '2024-01-01',
        updated_on: '2024-01-02',
        source: { branch: { name: 'feature' } },
        destination: { branch: { name: 'main' } },
        comment_count: 5,
        task_count: 2,
        reviewers: [{ display_name: 'Bob' }],
        participants: [
          {
            user: { display_name: 'Alice' },
            role: 'PARTICIPANT',
            approved: true,
          },
        ],
      };

      (mockContext.bitbucket.pullRequests.get as any).mockResolvedValue(mockPR);

      const result = await handleGetPullRequest(mockContext, { pr_id: 1 });

      expect(mockContext.bitbucket.pullRequests.get).toHaveBeenCalledWith(
        'default-workspace',
        'default-repo',
        1
      );
      expect(result.content[0].type).toBe('text');

      const prDetails = JSON.parse(result.content[0].text);
      expect(prDetails.id).toBe(1);
      expect(prDetails.title).toBe('Test PR');
      expect(prDetails.reviewers).toEqual(['Bob']);
    });

    it('should throw error if pr_id is missing', async () => {
      await expect(handleGetPullRequest(mockContext, {})).rejects.toThrow('pr_id is required');
    });

    it('should throw error if repo_slug is not provided and no default', async () => {
      mockContext.config.defaultRepo = undefined;

      await expect(handleGetPullRequest(mockContext, { pr_id: 1 })).rejects.toThrow(
        'repo_slug is required'
      );
    });
  });

  describe('handleGetPRCommits', () => {
    it('should get commits for a pull request', async () => {
      const mockResponse = {
        values: [
          {
            hash: 'abc123',
            message: 'Commit message',
            author: { raw: 'Alice <alice@example.com>' },
            date: '2024-01-01',
          },
        ],
        size: 1,
      };

      (mockContext.bitbucket.pullRequests.getCommits as any).mockResolvedValue(mockResponse);

      const result = await handleGetPRCommits(mockContext, { pr_id: 1 });

      expect(mockContext.bitbucket.pullRequests.getCommits).toHaveBeenCalledWith(
        'default-workspace',
        'default-repo',
        1
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.commits).toHaveLength(1);
      expect(data.commits[0].hash).toBe('abc123');
    });

    it('should throw error if pr_id is missing', async () => {
      await expect(handleGetPRCommits(mockContext, {})).rejects.toThrow('pr_id is required');
    });
  });

  describe('handleGetPRDiff', () => {
    it('should get diff for a pull request', async () => {
      const mockDiff = 'diff --git a/file.ts b/file.ts\n...';

      (mockContext.bitbucket.pullRequests.getDiff as any).mockResolvedValue(mockDiff);

      const result = await handleGetPRDiff(mockContext, { pr_id: 1 });

      expect(mockContext.bitbucket.pullRequests.getDiff).toHaveBeenCalledWith(
        'default-workspace',
        'default-repo',
        1
      );
      expect(result.content[0].text).toBe(mockDiff);
    });

    it('should throw error if pr_id is missing', async () => {
      await expect(handleGetPRDiff(mockContext, {})).rejects.toThrow('pr_id is required');
    });
  });
});
