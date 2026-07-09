import type { ListOptions } from '../types/common.js';

/**
 * List options plus the endpoint-specific extras that ride alongside the common
 * pagination/filter params in a query string.
 */
export interface ListQueryOptions extends ListOptions {
  /** Pull-request `state` filter (OPEN/MERGED/DECLINED/SUPERSEDED). */
  state?: string;
}

/**
 * The subset of options accepted by single-object GETs: only the `fields`
 * partial-response selector applies (there is nothing to paginate or filter).
 */
export interface FieldOptions {
  fields?: string;
}

/**
 * Build a `?...` query string from common list options.
 *
 * Params are appended in a stable order (`page`, `pagelen`, `state`, `q`,
 * `sort`, `fields`) so generated URLs are deterministic. Falsy values — including
 * an empty `q`/`sort` string — are treated as unset and omitted. Returns an empty
 * string when nothing is set, so it can be concatenated onto a path directly.
 *
 * This is the single place the `fields` partial-response param is emitted (see
 * {@link ListOptions.fields}); centralizing it keeps every resource's query
 * construction identical.
 */
export function buildListQuery(options?: ListQueryOptions): string {
  if (!options) return '';

  const params = new URLSearchParams();
  if (options.page) params.append('page', options.page.toString());
  if (options.pagelen) params.append('pagelen', options.pagelen.toString());
  if (options.state) params.append('state', options.state);
  if (options.q) params.append('q', options.q);
  if (options.sort) params.append('sort', options.sort);
  if (options.fields) params.append('fields', options.fields);

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Scoping options for the diff / diffstat endpoints.
 */
export interface DiffOptions {
  /**
   * Restrict the diff to one or more file paths. Bitbucket accepts `path`
   * repeated, so a string array becomes multiple `path=` params.
   */
  path?: string | string[];
  /** Number of context lines around each hunk (Bitbucket default is 3). */
  context?: number;
}

/**
 * Build a `?...` query string for the diff/diffstat endpoints. `path` may repeat;
 * `context` is emitted only when a finite value is supplied (0 is valid — it
 * requests a zero-context diff — so it is not treated as unset).
 */
export function buildDiffQuery(options?: DiffOptions): string {
  if (!options) return '';

  const params = new URLSearchParams();
  const paths = options.path === undefined ? [] : [options.path].flat();
  for (const p of paths) {
    if (p) params.append('path', p);
  }
  if (typeof options.context === 'number' && Number.isFinite(options.context)) {
    params.append('context', Math.max(0, Math.floor(options.context)).toString());
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
