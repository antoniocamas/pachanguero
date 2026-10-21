import type { Page } from '@playwright/test';
import { ConnectedBank, ReadGap, incomingBizum } from '../support/bank-setup';
import { FakeBank } from '../support/fake-bank';
import { openGameRow } from '../support/open-game';
import { PayableGame } from '../support/payable-game';
import { test, expect } from './auth.fixture';

// A Bizum the rules cannot place waits in Deudas until the organiser says who sent it. It needs
// the bank, which `the-bank-panel` leaves disconnected, so it connects it itself; it runs after
// the other specs, by name, which leave their own debts behind.

const tab = (page: Page, name: string) =>
  page.locator('nav.tabs').getByRole('button', { name });

test.describe('the waiting Bizums', () => {
  test('a Bizum from an unknown sender is read in Deudas, paired with a player, and pays their share', async ({
    page,
    request,
  }) => {
    const { gameId } = await new PayableGame(request).played([
      'Zespera Uno',
      'Zespera Dos',
    ]);
    await new ConnectedBank(request).ensure();
    await new FakeBank().addEntry(
      incomingBizum({
        reference: 'E2E-WAIT-1',
        amount: '4.00',
        sender: 'Zespera U.N.',
        subject: '',
      })
    );
    new ReadGap().reopen();

    await page.goto('/');
    await tab(page, 'Deudas').click();
    await page.getByRole('button', { name: 'Leer ahora' }).click();
    await page.getByRole('tab', { name: /En espera/ }).click();
    const waiting = page.getByTestId('waiting-bizums');
    await expect(
      page.locator('.bizums-strip').getByRole('status')
    ).toContainText('Lectura terminada');

    const item = waiting
      .getByTestId('waiting-bizum')
      .filter({ hasText: 'Zespera U.N.' });
    await expect(item).toContainText('No sabemos quién es el remitente.');
    await expect(item).toContainText('¿Es Zespera Uno?');
    await expect(
      item.getByRole('button', { name: 'Pagar cuotas' })
    ).toHaveCount(0);

    await item.getByRole('button', { name: 'Más acciones del Bizum' }).click();
    await item.getByRole('button', { name: 'Asignar jugador' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('¿Quién es este remitente?')
      .selectOption({ label: 'Zespera Uno' });
    await dialog.getByRole('button', { name: 'Emparejar' }).click();
    await expect(dialog.getByTestId('pair-result')).toContainText(
      'liquida la deuda del'
    );
    await dialog.getByRole('button', { name: 'Hecho' }).click();
    await expect(waiting.getByTestId('waiting-bizum')).toHaveCount(0);
    await expect(waiting).toContainText('No hay Bizums en espera.');

    await tab(page, 'Partido').click();
    const row = await openGameRow(page, gameId, 'Zespera Uno');
    await expect(row).toContainText('Pagado 4 € · Bizum');
  });

  test('the one suggested player is accepted with a single button, and the Bizum pays their share', async ({
    page,
    request,
  }) => {
    const { gameId } = await new PayableGame(request).played([
      'Zacepta Uno',
      'Zacepta Dos',
    ]);
    await new ConnectedBank(request).ensure();
    await new FakeBank().addEntry(
      incomingBizum({
        reference: 'E2E-ACCEPT-1',
        amount: '4.00',
        sender: 'Zacepta U.N.',
        subject: '',
      })
    );
    new ReadGap().reopen();

    await page.goto('/');
    await tab(page, 'Deudas').click();
    await page.getByRole('button', { name: 'Leer ahora' }).click();
    await page.getByRole('tab', { name: /En espera/ }).click();
    const waiting = page.getByTestId('waiting-bizums');
    const item = waiting
      .getByTestId('waiting-bizum')
      .filter({ hasText: 'Zacepta U.N.' });
    await item.getByRole('button', { name: 'Sí, es Zacepta Uno' }).click();
    await expect(page.getByTestId('pair-result')).toContainText(
      'liquida la deuda del'
    );
    await page.getByRole('button', { name: 'Hecho' }).click();
    await expect(waiting.getByTestId('waiting-bizum')).toHaveCount(0);

    await tab(page, 'Partido').click();
    const row = await openGameRow(page, gameId, 'Zacepta Uno');
    await expect(row).toContainText('Pagado 4 € · Bizum');
  });
});
