import { test as setup, expect } from '@playwright/test';

// Fixed credentials: the E2E database is ephemeral per run, so there is no
// duplicate-email risk across runs.
const E2E_EMAIL = 'e2e@example.com';
const E2E_PASSWORD = 'e2e-password-123';

setup('register the E2E user', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('Email').fill(E2E_EMAIL);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByLabel('Confirm password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Registration lands on the dashboard shell.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
