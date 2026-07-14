import type { Links } from './common.js';

/**
 * A commit build status (`GET .../commit/{hash}/statuses` and
 * `GET .../pullrequests/{id}/statuses`). Reported by CI systems — Bitbucket
 * Pipelines or any third-party integration — against a commit.
 */
export interface CommitStatus {
  /** Stable key the reporting system uses to update this status. */
  key: string;
  name?: string;
  description?: string;
  /** SUCCESSFUL | FAILED | INPROGRESS | STOPPED — plus any value not yet known. */
  state: 'SUCCESSFUL' | 'FAILED' | 'INPROGRESS' | 'STOPPED' | (string & {});
  /** Link to the build/check in the reporting system. */
  url?: string;
  /** Ref the status was reported against (when supplied). */
  refname?: string;
  commit?: { hash: string; type?: string; links?: Links };
  created_on?: string;
  updated_on?: string;
  links?: Links;
  type: 'build';
}
