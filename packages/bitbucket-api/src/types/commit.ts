import type { Links } from './common.js';

/**
 * One file's change summary from `GET .../diffstat/{spec}`. `old`/`new` are the
 * before/after paths (either is null for a pure add or delete); `status` is the
 * change kind.
 */
export interface DiffStat {
  type: 'diffstat';
  // The documented statuses, plus `string & {}` so any other value Bitbucket
  // returns is still accepted without collapsing the union to bare `string`.
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'merge conflict' | (string & {});
  lines_added: number;
  lines_removed: number;
  old?: DiffStatFile | null;
  new?: DiffStatFile | null;
}

export interface DiffStatFile {
  path: string;
  type?: string;
  escaped_path?: string;
  links?: Links;
}
