import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeploymentsResource } from './deployments.js';
import type { BitbucketClient } from '../client.js';

describe('DeploymentsResource', () => {
  let mockClient: BitbucketClient;
  let resource: DeploymentsResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ values: [], size: 0 }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as BitbucketClient;
    resource = new DeploymentsResource(mockClient);
  });

  it('lists deployments', async () => {
    await resource.listDeployments('ws', 'repo');
    expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/deployments');
  });

  it('lists environments', async () => {
    await resource.listEnvironments('ws', 'repo');
    expect(mockClient.get).toHaveBeenCalledWith('/repositories/ws/repo/environments');
  });
});
