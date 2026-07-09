import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { BitbucketAPI } from '@bobmaertz/bitbucket-api';
import {
  listWorkspaces,
  listProjects,
  getProject,
  listDeployments,
  listEnvironments,
  getBranchingModel,
  listWorkspaceMembers,
} from './operations.js';

/**
 * Hermetic integration test for the Phase 4 workspace/governance operations.
 */
describe('phase 4 operations (HTTP integration)', () => {
  let server: http.Server;
  let baseURL: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '';
      const jsonRes = (body: unknown): void => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      if (url === '/user/workspaces' || url.startsWith('/user/workspaces?')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 25,
          values: [
            {
              type: 'workspace_access',
              workspace: {
                type: 'workspace',
                slug: 'acme',
                name: 'Acme Inc',
                uuid: '{ws}',
                is_private: true,
                links: { html: { href: 'https://bitbucket.org/acme/' } },
              },
            },
          ],
        });
        return;
      }

      if (url.includes('/workspaces/acme/members')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 25,
          values: [
            {
              type: 'workspace_membership',
              user: { display_name: 'Ada', nickname: 'ada', account_id: 'acc-1', uuid: '{u}' },
            },
          ],
        });
        return;
      }

      // Project get (`/projects/WID`) vs list (`/projects`).
      if (/\/workspaces\/acme\/projects\/[^?]+/.test(url)) {
        jsonRes({
          key: 'WID',
          name: 'Widgets',
          description: 'Widget project',
          is_private: true,
          updated_on: '2026-07-01T10:00:00Z',
          links: { html: { href: 'https://bitbucket.org/acme/workspace/projects/WID' } },
          type: 'project',
        });
        return;
      }
      if (url.includes('/workspaces/acme/projects')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 25,
          values: [
            {
              key: 'WID',
              name: 'Widgets',
              is_private: true,
              links: { html: { href: 'https://bitbucket.org/acme/workspace/projects/WID' } },
              type: 'project',
            },
          ],
        });
        return;
      }

      if (url.includes('/effective-branching-model')) {
        jsonRes({
          type: 'branching_model',
          development: { branch: { name: 'develop' }, use_mainbranch: false },
          production: { enabled: true, branch: { name: 'main' }, use_mainbranch: true },
          branch_types: [
            { kind: 'feature', prefix: 'feature/' },
            { kind: 'hotfix', prefix: 'hotfix/' },
          ],
        });
        return;
      }

      if (url.includes('/deployments')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 25,
          values: [
            {
              uuid: '{dep}',
              state: { name: 'COMPLETED', status: { name: 'SUCCESSFUL' } },
              environment: { name: 'Production' },
              release: { name: 'v1.2.0', commit: { hash: 'deadbeefcafe0000' } },
              last_update_time: '2026-07-01T10:00:00Z',
            },
          ],
        });
        return;
      }

      if (url.includes('/environments')) {
        jsonRes({
          size: 1,
          page: 1,
          pagelen: 25,
          values: [
            {
              uuid: '{env}',
              name: 'Production',
              environment_type: { name: 'Production' },
              category: { name: 'prod' },
            },
          ],
        });
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseURL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function api(): BitbucketAPI {
    return new BitbucketAPI({ email: 'u@x.io', apiToken: 't', baseURL, retryBaseDelayMs: 0 });
  }

  it('lists workspaces (unwrapping the access envelope)', async () => {
    const page = await listWorkspaces(api(), {});
    expect(page.items[0]).toEqual({
      slug: 'acme',
      name: 'Acme Inc',
      uuid: '{ws}',
      is_private: true,
      url: 'https://bitbucket.org/acme/',
    });
  });

  it('lists and gets projects', async () => {
    const page = await listProjects(api(), { workspace: 'acme' });
    expect(page.items[0]).toMatchObject({ key: 'WID', name: 'Widgets' });
    const project = await getProject(api(), { workspace: 'acme', key: 'WID' });
    expect(project).toMatchObject({ key: 'WID', description: 'Widget project' });
  });

  it('lists deployments and environments', async () => {
    const deployments = await listDeployments(api(), { workspace: 'acme', repo: 'repo' });
    expect(deployments.items[0]).toEqual({
      uuid: '{dep}',
      state: 'SUCCESSFUL',
      environment: 'Production',
      release: 'v1.2.0',
      commit: 'deadbeefcafe',
      updated_on: '2026-07-01T10:00:00Z',
    });
    const environments = await listEnvironments(api(), { workspace: 'acme', repo: 'repo' });
    expect(environments.items[0]).toEqual({
      uuid: '{env}',
      name: 'Production',
      type: 'Production',
      category: 'prod',
    });
  });

  it('gets the effective branching model', async () => {
    const model = await getBranchingModel(api(), { workspace: 'acme', repo: 'repo' });
    expect(model).toEqual({
      development: 'develop',
      production: 'main',
      production_enabled: true,
      branch_types: [
        { kind: 'feature', prefix: 'feature/' },
        { kind: 'hotfix', prefix: 'hotfix/' },
      ],
    });
  });

  it('lists workspace members', async () => {
    const page = await listWorkspaceMembers(api(), { workspace: 'acme' });
    expect(page.items[0]).toEqual({
      name: 'Ada',
      nickname: 'ada',
      account_id: 'acc-1',
      uuid: '{u}',
    });
  });
});
