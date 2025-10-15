import type { User, Links, RenderedContent } from './common.js';

/**
 * Inline comment location information
 */
export interface InlineInfo {
  to?: number;
  from?: number;
  path: string;
}

/**
 * Comment object
 * Note: As of August 2025, comment IDs will be int64
 */
export interface Comment {
  id: number;
  content: RenderedContent;
  user: User;
  created_on: string;
  updated_on: string;
  inline?: InlineInfo;
  parent?: {
    id: number;
    links: Links;
  };
  links: Links;
  type: 'pullrequest_comment';
  deleted: boolean;
  pending?: boolean;
}

/**
 * Create comment parameters
 */
export interface CreateCommentParams {
  content: {
    raw: string;
  };
  parent?: {
    id: number;
  };
  inline?: InlineInfo;
}

/**
 * Update comment parameters
 */
export interface UpdateCommentParams {
  content: {
    raw: string;
  };
}
