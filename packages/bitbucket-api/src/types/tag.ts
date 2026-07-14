import type { Links, User } from './common.js';

/**
 * A git tag from `GET .../refs/tags`. Lightweight tags only point at a commit
 * (`target`); annotated tags additionally carry their own `message`, `date`, and
 * `tagger`.
 */
export interface Tag {
  name: string;
  target: {
    hash: string;
    date?: string;
    message?: string;
    author?: { raw?: string; user?: User };
    links?: Links;
    type: 'commit';
  };
  /** Annotated-tag message (distinct from the target commit's message). */
  message?: string;
  /** Annotated-tag date. */
  date?: string;
  /** Annotated-tag author. */
  tagger?: { raw?: string; user?: User };
  links?: Links;
  type: 'tag';
}
