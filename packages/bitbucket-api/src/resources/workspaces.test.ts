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

  it('resolves a single member and URL-encodes a brace-wrapped UUID', async () => {
    const membership = {
      type: 'workspace_membership',
      user: { type: 'user', display_name: 'Jo', account_id: 'acc-1', uuid: '{u}', links: {} },
      workspace: { type: 'workspace', slug: 'acme', uuid: '{w}', links: {} },
    };
    (mockClient.get as any).mockResolvedValue(membership);

    const result = await resource.getMember('acme', '{1234-5678}');

    expect(result).toBe(membership);
    // seg() encodes braces so the id can't alter the request path.
    expect(mockClient.get).toHaveBeenCalledWith('/workspaces/acme/members/%7B1234-5678%7D');
  });

  it('lists members via /workspaces/{workspace}/members', async () => {
    (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

    await resource.listMembers('acme', { pagelen: 100 });

    const path = (mockClient.get as any).mock.calls[0][0] as string;
    expect(path.startsWith('/workspaces/acme/members')).toBe(true);
    expect(path).toContain('pagelen=100');
  });

  it('follows an opaque next cursor verbatim when listing members', async () => {
    (mockClient.get as any).mockResolvedValue({ values: [], size: 0 });

    const next = 'https://api.bitbucket.org/2.0/workspaces/acme/members?page=2';
    await resource.listMembers('acme', { nextUrl: next });

    expect(mockClient.get).toHaveBeenCalledWith(next);
  });
});
