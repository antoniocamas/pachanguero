import { test, expect } from '@playwright/test';
import { E2E_ADMIN } from '../support/credentials';

// These journeys are about the login itself, so they use the plain test, not the fixture
// that logs in first.

test('shows the login first, refuses a wrong password, then lets the admin in', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajustes' })).toHaveCount(0);

  await page.getByLabel('Usuario').fill(E2E_ADMIN.username);
  await page.getByLabel('Contraseña').fill('Not-the-Password1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Usuario o contraseña incorrectos.'
  );

  await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Ajustes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
});

test('keeps the session across a reload, and Salir ends it for good', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Usuario').fill(E2E_ADMIN.username);
  await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('the API answers 401 to a caller with no token', async ({
  playwright,
  baseURL,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  const res = await anonymous.get('/api/seasons');
  expect(res.status()).toBe(401);
  await anonymous.dispose();
});
