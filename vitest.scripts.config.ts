import { defineConfig } from 'vitest/config';

// Root Vitest for the one-off scripts' pure transform: `pnpm test:scripts`,
// also part of `pnpm test`. Needs no emulator. Package tests run through
// `pnpm -r test`, the Security Rules through `pnpm test:rules`.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
  },
});
