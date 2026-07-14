import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommitsResource } from './commits.js';
import type { BitbucketClient } from '../client.js';

describe('CommitsResource', () => {
  let mockClient: BitbucketClient;
  let resource: CommitsResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ values: [], size: 0 }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as BitbucketClient;
    resource = new CommitsResource(mockClient);
  });

  describe('list', () => {
    it('lists commits with no query by default', async () => {
      await resource.list('ws', 'repo');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/commits');
    });

    it('repeats include/exclude and passes a path filter', async () => {
      await resource.list('ws', 'repo', {
        include: ['main', 'release'],
        exclude: 'dev',
        path: 'src/a.ts',
      });
      const url = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('include=main');
      expect(url).toContain('include=release');
      expect(url).toContain('exclude=dev');
      expect(url).toContain('path=src%2Fa.ts');
    });
  });

  describe('get', () => {
    it('targets a single commit', async () => {
      (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ hash: 'abc' });
      await resource.get('ws', 'repo', 'abc123');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/commit/abc123');
    });
  });

  describe('getDiff', () => {
    it('supports an a..b spec with path and context', async () => {
      (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue('diff');
      await resource.getDiff('ws', 'repo', 'aaa..bbb', { path: 'src/a.ts', context: 0 });
      const url = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('/repositories/ws/repo/diff/aaa..bbb?');
      expect(url).toContain('path=src%2Fa.ts');
      expect(url).toContain('context=0');
    });
  });

  describe('getDiffstat', () => {
    it('targets the diffstat endpoint with a path filter', async () => {
      await resource.getDiffstat('ws', 'repo', 'abc123', { path: 'src/a.ts' });
      const url = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('/repositories/ws/repo/diffstat/abc123?');
      expect(url).toContain('path=src%2Fa.ts');
    });
  });

  describe('getStatuses', () => {
    it('targets the commit statuses endpoint', async () => {
      await resource.getStatuses('ws', 'repo', 'abc123');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/commit/abc123/statuses');
    });
  });

  describe('getPullRequests', () => {
    it('targets the commit pullrequests endpoint', async () => {
      await resource.getPullRequests('ws', 'repo', 'abc123');
      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/ws/repo/commit/abc123/pullrequests'
      );
    });
  });
});
