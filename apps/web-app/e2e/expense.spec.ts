import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('create an expense through the form dialog', async ({ page }) => {
  await page.goto('/expenses');
  await page.getByRole('button', { name: 'Add expense' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('E2E groceries');
  await dialog.getByLabel('Amount').fill('49.99');
  await dialog.getByLabel('Category').selectOption({ label: 'food' });
  await dialog.getByRole('button', { name: 'Add expense' }).click();

  const row = page.getByRole('row', { name: /E2E groceries/ });
  await expect(row).toBeVisible();
  await expect(row.getByText('49.99')).toBeVisible(); // HK$49.99
  await expect(row.getByText('food')).toBeVisible();
});

test('dashboard reflects the created expense', async ({ page }) => {
  await page.goto('/');
  // Recent activity feed shows the expense
  await expect(page.getByText('E2E groceries')).toBeVisible();
  // Expenses stat card carries the transaction-count subtext
  await expect(page.getByText('1 transaction')).toBeVisible();
});

test('edit the expense', async ({ page }) => {
  await page.goto('/expenses');
  await page.getByRole('button', { name: 'Edit E2E groceries' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Amount')).toHaveValue('49.99'); // pre-seeded
  await dialog.getByLabel('Amount').fill('25.00');
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  const row = page.getByRole('row', { name: /E2E groceries/ });
  await expect(row.getByText('25.00')).toBeVisible();
});

test('delete the expense', async ({ page }) => {
  await page.goto('/expenses');
  await page.getByRole('button', { name: 'Delete E2E groceries' }).click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText('E2E groceries')).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByRole('row', { name: /E2E groceries/ })).toHaveCount(0);
  await expect(page.getByText('No expenses this month')).toBeVisible();
});
