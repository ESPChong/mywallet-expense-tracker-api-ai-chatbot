import { test, expect } from '@playwright/test';

test('analyst drawer replies with a grounded offline summary', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open AI analyst' }).click();

  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Ask anything about your finances')).toBeVisible();

  await drawer.getByRole('button', { name: 'How am I doing this month?' }).click();

  await expect(drawer.getByText('offline mode', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Summary for')).toHaveCount(1);

  await drawer.getByPlaceholder('Ask about your spending…').fill('Where is my money going?');
  await drawer.getByRole('button', { name: 'Send' }).click();
  await expect(drawer.getByText('Summary for')).toHaveCount(2);
});
