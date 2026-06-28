/**
 * Defense-in-depth secret scrubbing for strings that may be logged or
 * returned to a client (error messages, serialized objects). This is a
 * last line of defense — credentials should already be wrapped in `Secret`
 * and never embedded in error payloads — but anything routed through a log
 * sink or surfaced to the MCP client passes through here first.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Authorization header values: `Authorization: Basic xxxxx` / `Bearer xxxxx`
  [
    /((?:authorization|proxy-authorization)["']?\s*[:=]\s*["']?)(?:basic|bearer)\s+[^\s"',}]+/gi,
    '$1[REDACTED]',
  ],
  // Bare scheme + token anywhere in the text
  [/\b(basic|bearer)\s+[A-Za-z0-9+/=._~-]{8,}/gi, '$1 [REDACTED]'],
];

/**
 * Replace any credential-looking substrings with `[REDACTED]`.
 */
export function redactSecrets(input: string): string {
  let out = input;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
