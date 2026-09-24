import { defineConfig } from 'vitest/config';

// Root Vitest runs only the Security Rules test, which needs the Firestore
// emulator: `pnpm test:rules`. Package tests run through `pnpm test`.
export default defineConfig({
  test: {
    include: ['firestore.rules.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
