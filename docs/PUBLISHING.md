# Publishing `@bobmaertz/bitbucket-mcp`

The MCP server is published to npm as a **single self-contained bundle**. `build.mjs` (esbuild)
inlines the workspace `bitbucket-api` / `bitbucket-core` sources into `dist/index.js`, leaving only
`@modelcontextprotocol/sdk` and `axios` as real runtime dependencies. The published tarball is just
`dist/` + `README.md` (see the `files` field), so consumers can `npx -y @bobmaertz/bitbucket-mcp`
with nothing else to resolve.

## Why scoped?

The unscoped name `bitbucket-mcp-server` is already taken on npm (an unrelated package), so this
publishes under the **`@bobmaertz`** scope. `publishConfig.access` is set to `public` in
`package.json` so the scoped package is published publicly rather than as a private package.

## One-time setup

1. **npm account + scope.** You must own the `@bobmaertz` npm scope (i.e. your npm username is
   `bobmaertz`, or it's an org you belong to). To publish under a different identity, change both
   the `name` scope in `packages/bitbucket-mcp-server/package.json` and the references in the READMEs.
2. **Authenticate:** `npm login` (or set `NPM_TOKEN` in CI). Confirm with `npm whoami`.

## Release checklist

Run from the repo root unless noted.

1. **Clean tree & green build:**
   ```bash
   git status                       # nothing unexpected uncommitted
   npm ci
   npm run build
   npm test
   npm run test:contract
   npm run lint
   ```
2. **Bump the version** (in the server package):
   ```bash
   cd packages/bitbucket-mcp-server
   npm version patch                # or minor / major
   ```
3. **Dry-run the tarball** — verify only `dist/**` and `README.md` are included, and the bundle is
   self-contained:
   ```bash
   npm publish --dry-run
   npm pack --dry-run               # inspect the file list
   ```
4. **Publish:**
   ```bash
   npm publish                      # prepublishOnly runs typecheck + build; access:public is preset
   ```
5. **Smoke-test the published artifact** from a clean directory:
   ```bash
   cd "$(mktemp -d)"
   BITBUCKET_WORKSPACE=… BITBUCKET_EMAIL=… BITBUCKET_API_TOKEN=… \
     npx -y @bobmaertz/bitbucket-mcp
   # should start and speak MCP over stdio (Ctrl-C to exit)
   ```
6. **Tag & push:**
   ```bash
   cd ../..
   git push && git push --tags
   ```

## Notes

- **`prepublishOnly`** (`npm run typecheck && npm run build`) runs automatically on `npm publish`,
  so the shipped `dist/` always matches source. It does **not** run the test suite — run `npm test`
  yourself (step 1) before releasing.
- **Runtime deps must stay accurate.** Anything left `external` in `build.mjs` must also appear under
  `dependencies` in `package.json` (currently `@modelcontextprotocol/sdk` and `axios`). If you
  externalize another module, add it to `dependencies` too, or the published package will fail to
  resolve it at runtime.
- **Node engine:** the bundle targets `node18`. Keep that in sync with the `target` in `build.mjs`.
