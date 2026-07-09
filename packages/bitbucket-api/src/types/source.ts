import type { Links } from './common.js';

/**
 * A reference to the commit an `/src` entry was resolved at.
 */
export interface SrcCommitRef {
  hash: string;
  type: 'commit';
  links?: Links;
}

/**
 * A single entry in a directory listing from `GET .../src/{commit}/{path}` when
 * the target is a directory. `commit_file` entries carry `size`/`mimetype`;
 * `commit_directory` entries do not.
 */
export interface TreeEntry {
  path: string;
  type: 'commit_file' | 'commit_directory';
  size?: number;
  mimetype?: string | null;
  commit?: SrcCommitRef;
  attributes?: string[];
  links?: Links;
}

/**
 * File metadata from `GET .../src/{commit}/{path}?format=meta` — the shape of a
 * single `commit_file` object, returned instead of the raw bytes.
 */
export interface FileMeta {
  path: string;
  type: 'commit_file';
  size: number;
  mimetype?: string | null;
  encoding?: string;
  commit?: SrcCommitRef;
  attributes?: string[];
  links?: Links;
}
