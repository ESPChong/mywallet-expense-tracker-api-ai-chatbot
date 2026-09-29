import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    // Registers the E2E user once and saves the session cookie.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // Authenticated specs: expenses, incomes, chatbot.
    {
      name: 'authenticated',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /auth\.spec\.ts/],
    },
    // Anonymous specs: redirect and error paths. Order-independent by design —
    // wrong-credentials returns the same generic 401 for unknown emails.
    {
      name: 'anonymous',
      testMatch: /auth\.spec\.ts/,
    },
  ],
  webServer: {
    // Launcher boots an ephemeral Mongo replica set + pushes the schema,
    // then starts Next. Readiness is gated on the health endpoint.
    // reuseExistingServer stays false: a reused dev server would point at
    // the DEV database, not the ephemeral E2E one.
    command: 'node e2e/server.mjs',
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
