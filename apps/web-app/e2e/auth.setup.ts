// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

setup('register the E2E user', async ({ page }) => {
  mkdirSync('e2e/.auth', { recursive: true });

  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('Email').fill('e2e@example.com');

  const passwords = page.locator('input[type="password"]');
  await passwords.first().fill('e2e-password-123');
  await passwords.last().fill('e2e-password-123');

  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
