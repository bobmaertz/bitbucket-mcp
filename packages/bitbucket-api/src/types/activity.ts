import type { User } from './common.js';
import type { Comment } from './comment.js';

/**
 * One entry in a pull request's activity log (`GET .../pullrequests/{id}/activity`
 * and the repo-wide `.../pullrequests/activity`). Each entry carries exactly one
 * of `update` / `approval` / `changes_requested` / `comment`; the others are
 * absent. `pull_request` identifies which PR the event belongs to (useful in the
 * repo-wide feed).
 */
export interface PullRequestActivity {
  pull_request?: { id: number; title?: string };
  update?: PullRequestUpdate;
  approval?: PullRequestApproval;
  changes_requested?: PullRequestApproval;
  comment?: Comment;
}

export interface PullRequestUpdate {
  date?: string;
  author?: User;
  /** OPEN | MERGED | DECLINED | SUPERSEDED after this update. */
  state?: string;
  reason?: string;
  title?: string;
  source?: { branch?: { name?: string }; commit?: { hash?: string } };
  destination?: { branch?: { name?: string }; commit?: { hash?: string } };
}

export interface PullRequestApproval {
  date?: string;
  user?: User;
}
