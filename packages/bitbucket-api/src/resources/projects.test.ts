import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsResource } from './projects.js';
import type { BitbucketClient } from '../client.js';

describe('ProjectsResource', () => {
  let mockClient: BitbucketClient;
  let resource: ProjectsResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ values: [], size: 0 }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as BitbucketClient;
    resource = new ProjectsResource(mockClient);
  });

  it('lists projects in a workspace', async () => {
    await resource.list('acme');
    expect(mockClient.get).toHaveBeenCalledWith('/workspaces/acme/projects');
  });

  it('gets a project by key', async () => {
    (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ key: 'WID' });
    await resource.get('acme', 'WID');
    expect(mockClient.get).toHaveBeenCalledWith('/workspaces/acme/projects/WID');
  });
});
