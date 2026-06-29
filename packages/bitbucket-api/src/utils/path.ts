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
