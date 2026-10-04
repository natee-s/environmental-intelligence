import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  webServer: process.env.TEST_URL
    ? undefined
    : {
        command: 'npx tsx scripts/e2e-server.ts',
        url: 'http://127.0.0.1:3100/api/health',
        reuseExistingServer: false,
        timeout: 120000,
      },
  use: {
    baseURL: process.env.TEST_URL || 'http://127.0.0.1:3100',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
