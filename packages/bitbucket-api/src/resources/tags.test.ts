import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagsResource } from './tags.js';
import type { BitbucketClient } from '../client.js';

describe('TagsResource', () => {
  let mockClient: BitbucketClient;
  let resource: TagsResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ values: [], size: 0 }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as BitbucketClient;
    resource = new TagsResource(mockClient);
  });

  it('lists tags at the refs/tags endpoint', async () => {
    await resource.list('ws', 'repo');
    expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/refs/tags');
  });

  it('passes sort and pagination through', async () => {
    await resource.list('ws', 'repo', { sort: '-target.date', pagelen: 20 });
    const url = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/repositories/ws/repo/refs/tags?');
    expect(url).toContain('sort=-target.date');
    expect(url).toContain('pagelen=20');
  });

  it('gets a single tag by name', async () => {
    (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'v1.0' });
    await resource.get('ws', 'repo', 'v1.0');
    expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/refs/tags/v1.0');
  });
});
