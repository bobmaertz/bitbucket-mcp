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

  // Regression guard for CHANGE-2770: the deprecated `GET /workspaces` was
  // retired, so we must hit the supported `GET /user/workspaces` instead.
  it('lists workspaces via the supported /user/workspaces endpoint', async () => {
    (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

    await resource.list();

    expect(mockClient.get).toHaveBeenCalledWith('/user/workspaces');
    const path = (mockClient.get as any).mock.calls[0][0] as string;
    expect(path).not.toContain('/workspaces?'); // never the deprecated bare path
    expect(path.startsWith('/user/workspaces')).toBe(true);
  });

  it('surfaces the nested workspace from each workspace_access wrapper', async () => {
    (mockClient.get as any).mockResolvedValue({
      size: 1,
      page: 1,
      pagelen: 25,
      values: [
        {
          type: 'workspace_access',
          administrator: true,
          workspace: { type: 'workspace', slug: 'acme', name: 'Acme', uuid: '{w}', links: {} },
        },
      ],
    });

    const result = await resource.list();

    expect(result.values).toEqual([
      { type: 'workspace', slug: 'acme', name: 'Acme', uuid: '{w}', links: {} },
    ]);
  });

  it('passes paging through', async () => {
    (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

    await resource.list({ page: 2, pagelen: 10 });

    const path = (mockClient.get as any).mock.calls[0][0] as string;
    expect(path).toContain('/user/workspaces?');
    expect(path).toContain('page=2');
    expect(path).toContain('pagelen=10');
  });

  it('lists members at the workspace members endpoint', async () => {
    (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

    await resource.listMembers('acme');

    expect(mockClient.get).toHaveBeenCalledWith('/workspaces/acme/members');
  });
});
