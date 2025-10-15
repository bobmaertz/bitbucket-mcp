import type { User, Links, RenderedContent } from './common.js';

/**
 * Task state
 */
export type TaskState = 'RESOLVED' | 'UNRESOLVED';

/**
 * Task object
 * Note: As of August 2025, task IDs will be int64
 */
export interface Task {
  id: number;
  content: RenderedContent;
  state: TaskState;
  creator: User;
  created_on: string;
  updated_on: string;
  links: Links;
  type: 'task';
}

/**
 * Create task parameters
 */
export interface CreateTaskParams {
  content: {
    raw: string;
  };
}

/**
 * Update task parameters
 */
export interface UpdateTaskParams {
  state?: TaskState;
  content?: {
    raw: string;
  };
}
