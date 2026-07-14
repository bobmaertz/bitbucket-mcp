/**
 * URL path-segment helpers.
 *
 * Values such as `workspace` and `repoSlug` originate from tool callers and must
 * never be interpolated raw into a request path: an un-encoded `/`, `?`, `#`, or
 * `..` would let a caller alter the request's structure (reach a different API
 * endpoint, inject query parameters, or traverse) under the user's credential.
 * Always wrap caller-supplied string segments with {@link seg}.
 */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Encode a repository file path for use inside a request path (e.g. the `{path}`
 * of `/src/{commit}/{path}`). Unlike {@link seg}, the `/` separators are
 * preserved — each path component is individually percent-encoded so special
 * characters can't alter the request structure, but the directory hierarchy is
 * kept. Empty components (leading, trailing, or doubled slashes) are dropped.
 */
export function encodePath(path: string): string {
  return path
    .split('/')
    .filter((component) => component.length > 0)
    .map((component) => encodeURIComponent(component))
    .join('/');
}
