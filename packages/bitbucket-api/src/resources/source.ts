import type { BitbucketClient } from '../client.js';
import type {
  TreeEntry,
  FileMeta,
  Commit,
  PaginatedResponse,
  ListOptions,
  Links,
} from '../types/index.js';
import { seg, encodePath } from '../utils/path.js';
import { buildListQuery, type FieldOptions } from '../utils/query.js';

/**
 * A single entry in a file's history (`GET .../filehistory/...`): the file as it
 * existed at one commit that modified it.
 */
export interface FileHistoryEntry {
  path: string;
  type: 'commit_file' | 'commit_directory';
  size?: number;
  commit: Commit;
  links?: Links;
}

/** Options for a directory listing: pagination/filtering plus recursion depth. */
export interface DirectoryOptions extends ListOptions {
  /** Recurse into subdirectories up to this depth in a single call (default 1). */
  maxDepth?: number;
}

/**
 * Source browsing resource (read-only) over `GET .../src/...` and
 * `GET .../filehistory/...`.
 *
 * The `{commit}` segment accepts a commit hash, branch, or tag name; `{path}`
 * keeps its `/` separators (see {@link encodePath}). The `/src` endpoint is
 * dual-purpose — a directory yields a paginated JSON listing, a file yields raw
 * bytes (or JSON metadata with `?format=meta`).
 */
export class SourceResource {
  constructor(private client: BitbucketClient) {}

  /** List the entries of a directory at a given commit. */
  async listDirectory(
    workspace: string,
    repoSlug: string,
    commit: string,
    path: string,
    options?: DirectoryOptions
  ): Promise<PaginatedResponse<TreeEntry>> {
    const url = `${this.srcBase(workspace, repoSlug, commit, path)}${srcQuery(options)}`;
    return this.client.get<PaginatedResponse<TreeEntry>>(url);
  }

  /** Get a file's metadata (size, mimetype, commit) without its contents. */
  async getFileMeta(
    workspace: string,
    repoSlug: string,
    commit: string,
    path: string,
    options?: FieldOptions
  ): Promise<FileMeta> {
    const params = new URLSearchParams({ format: 'meta' });
    if (options?.fields) params.append('fields', options.fields);
    const url = `${this.srcBase(workspace, repoSlug, commit, path)}?${params.toString()}`;
    return this.client.get<FileMeta>(url);
  }

  /**
   * Fetch a file's raw contents as text, optionally with a byte `Range` (used to
   * cap large files). Returns the text plus size metadata.
   */
  async getFileContent(
    workspace: string,
    repoSlug: string,
    commit: string,
    path: string,
    range?: string
  ): Promise<{ text: string; totalBytes?: number; partial: boolean }> {
    return this.client.getText(this.srcBase(workspace, repoSlug, commit, path), range);
  }

  /** List the commits that modified a file (newest first), following renames. */
  async getFileHistory(
    workspace: string,
    repoSlug: string,
    commit: string,
    path: string,
    options?: ListOptions & { renames?: boolean }
  ): Promise<PaginatedResponse<FileHistoryEntry>> {
    const base = `/repositories/${seg(workspace)}/${seg(repoSlug)}/filehistory/${seg(
      commit
    )}/${encodePath(path)}`;
    const query = buildListQuery(options);
    // `renames=false` disables git's rename-following; only append when explicitly off.
    const url =
      options?.renames === false
        ? `${base}${query ? `${query}&` : '?'}renames=false`
        : `${base}${query}`;
    return this.client.get<PaginatedResponse<FileHistoryEntry>>(url);
  }

  private srcBase(workspace: string, repoSlug: string, commit: string, path: string): string {
    const encodedPath = encodePath(path);
    const suffix = encodedPath ? `/${encodedPath}` : '';
    return `/repositories/${seg(workspace)}/${seg(repoSlug)}/src/${seg(commit)}${suffix}`;
  }
}

/** Build the query string for a directory listing, adding `max_depth` when set. */
function srcQuery(options?: DirectoryOptions): string {
  const base = buildListQuery(options);
  if (options?.maxDepth === undefined || !Number.isFinite(options.maxDepth)) return base;
  const depth = Math.max(1, Math.floor(options.maxDepth));
  return `${base}${base ? '&' : '?'}max_depth=${depth}`;
}
