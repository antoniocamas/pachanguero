import type { Page } from '@playwright/test';
import { today } from '../support/bank-setup';
import { PayableGame } from '../support/payable-game';
import { test, expect } from './auth.fixture';

// The bank access, from the Ajustes › Banco panel to the fake bank and back. It leaves the bank
// disconnected, so the journeys that need it connect it themselves. It runs before them, and
// before `the-own-view`, by name.

const openBank = async (page: Page) => {
  await page.goto('/');
  await page
    .locator('nav.tabs')
    .getByRole('button', { name: 'Ajustes' })
    .click();
  await page.getByRole('tab', { name: 'Banco' }).click();
};

test.describe('the bank panel', () => {
  test('connects through the bank and back, chooses the account and the start date, reads, and disconnects', async ({
    page,
    request,
  }) => {
    // Manage is shown only with a season, which a run of this spec alone does not have yet.
    await new PayableGame(request).season();
    await openBank(page);
    const card = page.getByTestId('bank-connection');
    await expect(card).toContainText('Sin conexión');
    await expect(
      page.getByRole('combobox', { name: /^Banco/ }).locator('option')
    ).toHaveText(['Revolut']);

    // The bank's own page is the fake's, which approves at once and sends the browser back.
    await page.getByRole('button', { name: 'Conectar con Revolut' }).click();
    await expect(page.getByTestId('bank-return')).toContainText(
      /^Conectado hasta \d{2}\/\d{2}\/\d{4}$/
    );
    await expect(card).toContainText('Conectado · Revolut');
    expect(page.url()).not.toContain('bank=');

    // Two EUR accounts: one is asked for, and nothing is read until it is chosen.
    const accounts = page.getByTestId('bank-accounts');
    await expect(accounts).toContainText('Hay dos cuentas en esa moneda');
    await expect(card.getByRole('button', { name: 'Leer ahora' })).toHaveCount(
      0
    );
    await accounts.getByLabel('Corriente · EUR ··· 4444').click();
    await expect(accounts.getByLabel('Corriente · EUR ··· 4444')).toBeChecked();

    await page.getByLabel('Se ignora todo lo anterior al').fill(today());
    await page.getByRole('button', { name: 'Guardar fecha' }).click();
    await expect(page.getByTestId('bank-reading')).toContainText(
      'Se ignora todo lo anterior al'
    );

    // A read ends with its result, and a second one at once is told to wait.
    const readNow = card.getByRole('button', { name: 'Leer ahora' });
    await readNow.click();
    await expect(card.getByRole('status')).toContainText('Lectura terminada');
    await expect(page.getByTestId('last-read')).toContainText('correcta');
    await readNow.click();
    await expect(card.getByRole('status')).toHaveText(
      'Espera unos minutos antes de volver a leer.'
    );

    await card.getByRole('button', { name: 'Desconectar' }).click();
    await page.getByRole('button', { name: 'Sí, desconectar' }).click();
    await expect(card).toContainText('Sin conexión');
    await expect(
      page.getByRole('button', { name: 'Conectar con Revolut' })
    ).toBeEnabled();
  });
});
