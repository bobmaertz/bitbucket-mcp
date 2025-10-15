import type { User, Links, BranchInfo, Participant, RenderedContent } from './common.js';

/**
 * Pull request state
 */
export type PullRequestState = 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';

/**
 * Pull request object
 */
export interface PullRequest {
  id: number;
  title: string;
  description?: string;
  rendered?: {
    title: RenderedContent;
    description: RenderedContent;
  };
  state: PullRequestState;
  author: User;
  source: BranchInfo;
  destination: BranchInfo;
  merge_commit: {
    hash: string;
  } | null;
  comment_count: number;
  task_count: number;
  close_source_branch: boolean;
  closed_by: User | null;
  reason: string;
  created_on: string;
  updated_on: string;
  reviewers: User[];
  participants: Participant[];
  links: Links;
  summary?: RenderedContent;
  type: 'pullrequest';
}

/**
 * Create pull request parameters
 */
export interface CreatePullRequestParams {
  title: string;
  description?: string;
  source: {
    branch: {
      name: string;
    };
  };
  destination: {
    branch: {
      name: string;
    };
  };
  reviewers?: Array<{ uuid: string }>;
  close_source_branch?: boolean;
}

/**
 * Update pull request parameters
 */
export interface UpdatePullRequestParams {
  title?: string;
  description?: string;
  reviewers?: Array<{ uuid: string }>;
  close_source_branch?: boolean;
}
