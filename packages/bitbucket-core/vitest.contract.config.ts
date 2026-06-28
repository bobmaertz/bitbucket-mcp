import { defineConfig } from 'vitest/config';

// Contract tier — validates request paths and response shapes against the
// vendored Bitbucket OpenAPI spec. Run via `npm run test:contract`, in its own
// CI job, or manually by a developer.
export default defineConfig({
  test: {
    include: ['**/*.contract.test.ts'],
  },
});
