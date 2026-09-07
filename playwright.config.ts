import { defineConfig, devices } from '@playwright/test';

// Browser regression tests for the web app. Chromium only: the team runs these
// locally and in CI to guard the two bugs that kept coming back in the prototype
// (focus loss while typing in the editor, and the shared Rule Set / Rule context
// resetting between actions or on refresh).
const port = Number(process.env.PORT ?? 5173);

export default defineConfig({
  testDir: 'apps/web/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
