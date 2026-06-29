import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspacesResource } from './workspaces.js';
import type { BitbucketClient } from '../client.js';

describe('WorkspacesResource', () => {
  let mockClient: BitbucketClient;
  let resource: WorkspacesResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as any;

    resource = new WorkspacesResource(mockClient);
  });

  it('lists workspaces with no options', async () => {
    (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

    await resource.list();

    expect(mockClient.get).toHaveBeenCalledWith('/workspaces');
  });

  it('applies the membership role filter', async () => {
    (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

    await resource.list({ role: 'member' });

    expect(mockClient.get).toHaveBeenCalledWith('/workspaces?role=member');
  });

  it('passes paging through', async () => {
    (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

    await resource.list({ page: 2, pagelen: 10 });

    const path = (mockClient.get as any).mock.calls[0][0] as string;
    expect(path).toContain('/workspaces?');
    expect(path).toContain('page=2');
    expect(path).toContain('pagelen=10');
  });
});
