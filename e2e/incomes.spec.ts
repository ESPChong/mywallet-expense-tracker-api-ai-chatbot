import { test, expect } from '@playwright/test';

test('create a recurring income and toggle it', async ({ page }) => {
  await page.goto('/incomes');
  await page.getByRole('button', { name: 'Add income' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('E2E salary');
  await dialog.getByLabel('Amount').fill('2000');
  await dialog.getByLabel('Posts on').selectOption({ label: 'The 1st' });
  await dialog.getByRole('button', { name: 'Add income' }).click();

  await expect(page.getByText('E2E salary')).toBeVisible();
  await expect(page.getByText('HK$2,000.00')).toBeVisible();

  // Pause: optimistic toggle flips the switch and shows the Paused label
  await page.getByRole('switch', { name: 'Pause E2E salary' }).click();
  await expect(page.getByText('Paused')).toBeVisible();

  // Resume
  await page.getByRole('switch', { name: 'Resume E2E salary' }).click();
  await expect(page.getByText('Paused')).toBeHidden();
});
