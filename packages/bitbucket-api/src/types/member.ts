import type { User, Workspace } from './common.js';

/**
 * A workspace membership (`GET /workspaces/{ws}/members`): a user and the
 * workspace they belong to.
 */
export interface WorkspaceMember {
  user: User;
  workspace?: Workspace;
  type?: string;
}
