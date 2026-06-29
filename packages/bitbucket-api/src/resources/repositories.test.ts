import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepositoriesResource } from './repositories.js';
import type { BitbucketClient } from '../client.js';

describe('RepositoriesResource', () => {
  let mockClient: BitbucketClient;
  let resource: RepositoriesResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as any;

    resource = new RepositoriesResource(mockClient);
  });

  describe('list', () => {
    it('lists repositories in a workspace', async () => {
      (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

      await resource.list('acme');

      expect(mockClient.get).toHaveBeenCalledWith('/repositories/acme');
    });

    it('passes paging, query, and sort through', async () => {
      (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

      await resource.list('acme', { page: 2, pagelen: 50, q: 'name~"api"', sort: '-updated_on' });

      const path = (mockClient.get as any).mock.calls[0][0] as string;
      expect(path).toContain('/repositories/acme?');
      expect(path).toContain('page=2');
      expect(path).toContain('pagelen=50');
      expect(path).toContain('sort=-updated_on');
    });
  });

  describe('get', () => {
    it('gets a single repository', async () => {
      const repo = { full_name: 'acme/repo', slug: 'repo' };
      (mockClient.get as any).mockResolvedValue(repo);

      const result = await resource.get('acme', 'repo');

      expect(mockClient.get).toHaveBeenCalledWith('/repositories/acme/repo');
      expect(result).toEqual(repo);
    });

    it('encodes path segments so a crafted slug cannot reach another endpoint', async () => {
      (mockClient.get as any).mockResolvedValue({});

      await resource.get('acme', '../../workspaces/victim');

      const path = (mockClient.get as any).mock.calls[0][0] as string;
      expect(path).toBe('/repositories/acme/..%2F..%2Fworkspaces%2Fvictim');
      expect(path).not.toContain('/workspaces/victim');
    });
  });
});
