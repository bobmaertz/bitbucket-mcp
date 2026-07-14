import type { Links, User } from './common.js';

/**
 * A deployment (`GET .../deployments`). Ties a pipeline release to an
 * environment, with the current state of that deployment.
 */
export interface Deployment {
  uuid?: string;
  state?: {
    type?: string;
    /** UNDEPLOYED | IN_PROGRESS | COMPLETED | FAILED, etc. */
    name?: string;
    status?: { type?: string; name?: string };
    url?: string;
  };
  environment?: { uuid?: string; name?: string; type?: string };
  release?: {
    uuid?: string;
    name?: string;
    commit?: { hash?: string };
    created_on?: string;
    creator?: User;
  };
  last_update_time?: string;
  links?: Links;
  type?: string;
}

/**
 * A deployment environment (`GET .../environments`).
 */
export interface Environment {
  uuid?: string;
  name?: string;
  slug?: string;
  environment_type?: { name?: string; rank?: number; type?: string };
  category?: { name?: string };
  restrictions?: unknown;
  hidden?: boolean;
  type?: string;
}
