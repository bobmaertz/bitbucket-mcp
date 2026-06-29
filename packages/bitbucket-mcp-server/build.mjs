import { build } from 'esbuild';

/**
 * Bundle the server (plus the workspace-local bitbucket-api / bitbucket-core
 * sources) into a single self-contained dist/index.js, so the published npm
 * package has no `file:` workspace dependencies. Only genuine third-party
 * runtime deps are left external for the consumer's installer to resolve.
 */
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: 'dist/index.js',
  // Keep these as real imports → declared as runtime `dependencies`.
  external: ['@modelcontextprotocol/sdk', 'axios'],
  // No shebang banner: esbuild preserves the shebang from src/index.ts, and a
  // banner would duplicate it onto line 2 (an invalid-token SyntaxError).
  logLevel: 'info',
});
