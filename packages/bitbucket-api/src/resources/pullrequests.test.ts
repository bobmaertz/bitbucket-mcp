import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PullRequestsResource } from './pullrequests.js';
import type { BitbucketClient } from '../client.js';

describe('PullRequestsResource', () => {
  let mockClient: BitbucketClient;
  let resource: PullRequestsResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as any;

    resource = new PullRequestsResource(mockClient);
  });

  describe('list', () => {
    it('should list pull requests with default options', async () => {
      const mockResponse = { values: [], size: 0 };
      (mockClient.get as any).mockResolvedValue(mockResponse);

      await resource.list('workspace', 'repo');

      expect(mockClient.get).toHaveBeenCalledWith('/repositories/workspace/repo/pullrequests');
    });

    it('should list pull requests with state filter', async () => {
      const mockResponse = { values: [], size: 0 };
      (mockClient.get as any).mockResolvedValue(mockResponse);

      await resource.list('workspace', 'repo', { state: 'OPEN' });

      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests?state=OPEN'
      );
    });

    it('should list pull requests with pagination options', async () => {
      const mockResponse = { values: [], size: 0 };
      (mockClient.get as any).mockResolvedValue(mockResponse);

      await resource.list('workspace', 'repo', { page: 2, pagelen: 50 });

      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests?page=2&pagelen=50'
      );
    });

    it('should list pull requests with all options', async () => {
      const mockResponse = { values: [], size: 0 };
      (mockClient.get as any).mockResolvedValue(mockResponse);

      await resource.list('workspace', 'repo', {
        state: 'MERGED',
        page: 1,
        pagelen: 25,
        q: 'title~"feature"',
        sort: '-updated_on',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/repositories/workspace/repo/pullrequests?')
      );
      expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('state=MERGED'));
      expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('page=1'));
      expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('pagelen=25'));
    });
  });

  describe('listByWorkspaceUser', () => {
    it('hits the workspace-user endpoint with an encoded selected_user', async () => {
      (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

      await resource.listByWorkspaceUser('acme', '{1234-abcd}', {
        state: 'OPEN',
        pagelen: 100,
        sort: '-updated_on',
      });

      const path = (mockClient.get as any).mock.calls[0][0] as string;
      expect(path.startsWith('/workspaces/acme/pullrequests/')).toBe(true);
      // Braces of the UUID must be percent-encoded so they can't alter the path.
      expect(path).toContain('%7B1234-abcd%7D');
      expect(path).not.toContain('{1234-abcd}');
      expect(path).toContain('state=OPEN');
      expect(path).toContain('pagelen=100');
      expect(path).toContain('sort=-updated_on');
    });

    it('follows a verbatim next URL without re-encoding or prefixing', async () => {
      (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });
      const nextUrl = 'https://api.bitbucket.org/2.0/workspaces/acme/pullrequests/x?page=2';

      await resource.listByWorkspaceUser('acme', 'x', { nextUrl });

      expect(mockClient.get).toHaveBeenCalledWith(nextUrl);
    });
  });

  describe('get', () => {
    it('should get a specific pull request', async () => {
      const mockPR = { id: 123, title: 'Test PR' };
      (mockClient.get as any).mockResolvedValue(mockPR);

      const result = await resource.get('workspace', 'repo', 123);

      expect(mockClient.get).toHaveBeenCalledWith('/repositories/workspace/repo/pullrequests/123');
      expect(result).toEqual(mockPR);
    });
  });

  describe('create', () => {
    it('should create a pull request', async () => {
      const mockPR = { id: 123, title: 'New PR' };
      const params = {
        title: 'New PR',
        source: { branch: { name: 'feature' } },
        destination: { branch: { name: 'main' } },
      };
      (mockClient.post as any).mockResolvedValue(mockPR);

      const result = await resource.create('workspace', 'repo', params);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests',
        params
      );
      expect(result).toEqual(mockPR);
    });
  });

  describe('update', () => {
    it('should update a pull request', async () => {
      const mockPR = { id: 123, title: 'Updated PR' };
      const params = { title: 'Updated PR' };
      (mockClient.put as any).mockResolvedValue(mockPR);

      const result = await resource.update('workspace', 'repo', 123, params);

      expect(mockClient.put).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123',
        params
      );
      expect(result).toEqual(mockPR);
    });
  });

  describe('decline', () => {
    it('should decline a pull request', async () => {
      const mockPR = { id: 123, state: 'DECLINED' };
      (mockClient.post as any).mockResolvedValue(mockPR);

      const result = await resource.decline('workspace', 'repo', 123);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/decline'
      );
      expect(result).toEqual(mockPR);
    });
  });

  describe('approve', () => {
    it('should approve a pull request', async () => {
      (mockClient.post as any).mockResolvedValue(undefined);

      await resource.approve('workspace', 'repo', 123);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/approve'
      );
    });
  });

  describe('unapprove', () => {
    it('should unapprove a pull request', async () => {
      (mockClient.delete as any).mockResolvedValue(undefined);

      await resource.unapprove('workspace', 'repo', 123);

      expect(mockClient.delete).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/approve'
      );
    });
  });

  describe('merge', () => {
    it('should merge a pull request with default options', async () => {
      const mockPR = { id: 123, state: 'MERGED' };
      (mockClient.post as any).mockResolvedValue(mockPR);

      const result = await resource.merge('workspace', 'repo', 123);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/merge',
        undefined
      );
      expect(result).toEqual(mockPR);
    });

    it('should merge a pull request with options', async () => {
      const mockPR = { id: 123, state: 'MERGED' };
      const options = {
        message: 'Merge commit message',
        close_source_branch: true,
        merge_strategy: 'squash' as const,
      };
      (mockClient.post as any).mockResolvedValue(mockPR);

      const result = await resource.merge('workspace', 'repo', 123, options);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/merge',
        options
      );
      expect(result).toEqual(mockPR);
    });
  });

  describe('getCommits', () => {
    it('should get commits for a pull request', async () => {
      const mockResponse = { values: [{ hash: 'abc123' }], size: 1 };
      (mockClient.get as any).mockResolvedValue(mockResponse);

      const result = await resource.getCommits('workspace', 'repo', 123);

      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/commits'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should get commits with pagination options', async () => {
      const mockResponse = { values: [], size: 0 };
      (mockClient.get as any).mockResolvedValue(mockResponse);

      await resource.getCommits('workspace', 'repo', 123, { page: 2, pagelen: 25 });

      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/commits?page=2&pagelen=25'
      );
    });
  });

  describe('getDiff', () => {
    it('should get diff for a pull request', async () => {
      const mockDiff = 'diff --git a/file.ts b/file.ts\n...';
      (mockClient.get as any).mockResolvedValue(mockDiff);

      const result = await resource.getDiff('workspace', 'repo', 123);

      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/diff'
      );
      expect(result).toEqual(mockDiff);
    });
  });

  describe('getPatch', () => {
    it('should get patch for a pull request', async () => {
      const mockPatch = 'From abc123...\n...';
      (mockClient.get as any).mockResolvedValue(mockPatch);

      const result = await resource.getPatch('workspace', 'repo', 123);

      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/workspace/repo/pullrequests/123/patch'
      );
      expect(result).toEqual(mockPatch);
    });
  });
});
