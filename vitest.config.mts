import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Unit tests only — pure business logic (CIDR math, CSV parsing, zod
// schemas) that doesn't touch Prisma, Supabase, or the DOM. Deliberately
// does not pull in a React/DOM environment or a test database; this sandbox
// has no network access to the app's real Postgres instance, and even in a
// normal dev environment those would be a separate, heavier test suite.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
});
