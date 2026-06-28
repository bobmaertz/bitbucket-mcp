import { defineConfig } from 'vitest/config';

// Default unit/integration run — fast and hermetic. Contract tests (which load
// the vendored OpenAPI spec) are excluded here and run via `test:contract`.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.contract.test.ts'],
  },
});
