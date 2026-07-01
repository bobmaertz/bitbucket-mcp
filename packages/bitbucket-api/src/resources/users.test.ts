import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersResource } from './users.js';
import type { BitbucketClient } from '../client.js';

describe('UsersResource', () => {
  let mockClient: BitbucketClient;
  let resource: UsersResource;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as any;

    resource = new UsersResource(mockClient);
  });

  it('resolves the authenticated user via GET /user', async () => {
    const me = { account_id: 'acc-1', uuid: '{me}', display_name: 'Jo', type: 'user' };
    (mockClient.get as any).mockResolvedValue(me);

    const result = await resource.getCurrent();

    expect(mockClient.get).toHaveBeenCalledWith('/user');
    expect(result).toEqual(me);
  });
});
