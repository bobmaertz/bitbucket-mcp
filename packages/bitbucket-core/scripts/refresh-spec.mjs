#!/usr/bin/env node
/**
 * Refresh the vendored Bitbucket Cloud OpenAPI (Swagger 2.0) spec used by the
 * contract tests. Run manually when Bitbucket's API contract changes:
 *
 *   node scripts/refresh-spec.mjs
 *
 * The spec is committed so contract tests stay hermetic in CI.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SPEC_URL = 'https://api.bitbucket.org/swagger.json';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'contract', 'bitbucket-openapi.json');

const res = await fetch(SPEC_URL);
if (!res.ok) {
  console.error(`Failed to fetch ${SPEC_URL}: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const spec = await res.json();
if (spec.swagger !== '2.0' && !spec.openapi) {
  console.error('Unexpected spec format (no swagger/openapi version field)');
  process.exit(1);
}
// Written compact (no indentation) to keep the vendored file small.
await writeFile(OUT, JSON.stringify(spec));
console.error(`Wrote ${OUT} (${Object.keys(spec.definitions ?? {}).length} definitions)`);
