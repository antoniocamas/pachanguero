import { test, expect } from '@playwright/test';

test('creates the first season and adds a player to the roster', async ({
  page,
}) => {
  await page.goto('/');

  // First run: no seasons exist yet, so the app asks for a name via window.prompt().
  page.once('dialog', dialog => dialog.accept('2025/2026'));
  await page.getByRole('button', { name: 'Crear la primera' }).click();

  await expect(page.getByText('2025/2026')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByPlaceholder('Nombre').fill('Antonio');
  await page.getByRole('button', { name: '+', exact: true }).click();

  await expect(page.getByText('Antonio')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Jugones' })).toContainText(
    '1'
  );
});
