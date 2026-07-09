import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BranchesResource } from './branches.js';
import type { BitbucketClient } from '../client.js';

describe('BranchesResource', () => {
  let mockClient: BitbucketClient;
  let resource: BranchesResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ values: [], size: 0 }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as BitbucketClient;
    resource = new BranchesResource(mockClient);
  });

  it('lists branches at the refs/branches endpoint', async () => {
    await resource.list('ws', 'repo');
    expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/refs/branches');
  });

  it('gets the effective branching model', async () => {
    (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'branching_model' });
    await resource.getBranchingModel('ws', 'repo');
    expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/effective-branching-model');
  });
});
