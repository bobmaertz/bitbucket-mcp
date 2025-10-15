import type { Links, User } from './common.js';

/**
 * Branch object
 */
export interface Branch {
  name: string;
  target: {
    hash: string;
    date: string;
    author: User;
    message: string;
    parents?: Array<{
      hash: string;
    }>;
    repository?: {
      name: string;
      full_name: string;
      uuid: string;
      links: Links;
    };
    links: Links;
    type: 'commit';
  };
  links: Links;
  type: 'branch';
  default_merge_strategy?: string;
  merge_strategies?: string[];
}

/**
 * Create branch parameters
 */
export interface CreateBranchParams {
  name: string;
  target: {
    hash: string;
  };
}
