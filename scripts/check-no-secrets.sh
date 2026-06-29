#!/usr/bin/env bash
#
# Credential-leak guard: a fast, dependency-free check that
#   1. .gitignore excludes the usual env files, and
#   2. no credential-bearing files are tracked by git.
#
# This complements (does not replace) the gitleaks content scan in CI, which
# inspects file contents and history. Run locally with `npm run security:check`.

set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# 1. .gitignore must exclude env files so secrets can't be committed by accident.
for pattern in '.env' '.env.local'; do
  escaped="${pattern//./\\.}"
  if ! grep -qE "^${escaped}(\$|/|\\.)" .gitignore 2>/dev/null; then
    echo "ERROR: .gitignore is missing an entry covering '${pattern}'"
    fail=1
  fi
done

# 2. No secret-bearing files may be tracked. `.env.example` (placeholders only)
#    is the sole permitted env file.
tracked_secrets="$(
  git ls-files \
    | grep -iE '(^|/)\.env($|\.)|\.pem$|\.p12$|\.pfx$|\.keystore$|\.key$|(^|/)id_(rsa|dsa|ecdsa|ed25519)$' \
    | grep -vE '\.env\.example$' \
    || true
)"
if [ -n "$tracked_secrets" ]; then
  echo "ERROR: credential-bearing files are tracked by git:"
  echo "$tracked_secrets" | sed 's/^/  - /'
  echo "Remove them with 'git rm --cached <file>' and ensure they are gitignored."
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "Security check FAILED."
  exit 1
fi

echo "Security check passed: .gitignore covers env files; no tracked secret files."
