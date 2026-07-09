import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceResource } from './source.js';
import type { BitbucketClient } from '../client.js';

describe('SourceResource', () => {
  let mockClient: BitbucketClient;
  let resource: SourceResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ values: [], size: 0 }),
      getText: vi.fn().mockResolvedValue({ text: '', totalBytes: 0, partial: false }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as BitbucketClient;
    resource = new SourceResource(mockClient);
  });

  describe('listDirectory', () => {
    it('builds a /src path that preserves the path separators', async () => {
      await resource.listDirectory('ws', 'repo', 'main', 'src/lib');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/src/main/src/lib');
    });

    it('omits the path segment for the repo root', async () => {
      await resource.listDirectory('ws', 'repo', 'main', '');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/src/main');
    });

    it('appends max_depth alongside pagination', async () => {
      await resource.listDirectory('ws', 'repo', 'main', 'src', { maxDepth: 3, pagelen: 50 });
      const url = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('/repositories/ws/repo/src/main/src?');
      expect(url).toContain('pagelen=50');
      expect(url).toContain('max_depth=3');
    });

    it('percent-encodes special characters within a path component', async () => {
      await resource.listDirectory('ws', 'repo', 'main', 'a b/c?.ts');
      expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/src/main/a%20b/c%3F.ts');
    });
  });

  describe('getFileMeta', () => {
    it('requests format=meta with fields', async () => {
      (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ path: 'x', size: 1 });
      await resource.getFileMeta('ws', 'repo', 'main', 'src/a.ts', { fields: 'size,path' });
      const url = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('/repositories/ws/repo/src/main/src/a.ts?');
      expect(url).toContain('format=meta');
      expect(url).toContain('fields=size%2Cpath');
    });
  });

  describe('getFileContent', () => {
    it('delegates to getText with an optional Range', async () => {
      await resource.getFileContent('ws', 'repo', 'main', 'src/a.ts', 'bytes=0-1023');
      expect(mockClient.getText).toHaveBeenCalledWith(
        '/repositories/ws/repo/src/main/src/a.ts',
        'bytes=0-1023'
      );
    });
  });

  describe('getFileHistory', () => {
    it('targets the filehistory endpoint', async () => {
      await resource.getFileHistory('ws', 'repo', 'main', 'src/a.ts');
      expect(mockClient.get).toHaveBeenCalledWith(
        '/repositories/ws/repo/filehistory/main/src/a.ts'
      );
    });

    it('adds renames=false only when explicitly disabled', async () => {
      await resource.getFileHistory('ws', 'repo', 'main', 'src/a.ts', { renames: false, page: 2 });
      const url = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('page=2');
      expect(url).toContain('renames=false');
    });
  });
});
