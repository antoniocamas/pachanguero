import type { Page } from '@playwright/test';
import { ConnectedBank, ReadGap, incomingBizum } from '../support/bank-setup';
import { FakeBank } from '../support/fake-bank';
import { openGameRow } from '../support/open-game';
import { PayableGame } from '../support/payable-game';
import { test, expect } from './auth.fixture';

// The organiser rules that a Bizum pays one share, finds the change left on it, undoes the payment
// and sends the Bizum away for good. Like the other bank journeys it connects the bank itself, and
// it runs after `the-bank-panel`, by name.

const tab = (page: Page, name: string) =>
  page.locator('nav.tabs').getByRole('button', { name });

test.describe('correcting a Bizum', () => {
  test('a ruling leaves the change on the Bizum, undoing it lists the Bizum again, and it is dismissed', async ({
    page,
    request,
  }) => {
    const { gameId } = await new PayableGame(request).played([
      'Zcorrige Uno',
      'Zcorrige Dos',
    ]);
    await new ConnectedBank(request).ensure();
    await new FakeBank().addEntry(
      incomingBizum({
        reference: 'E2E-FIX-1',
        amount: '4.50',
        sender: 'Zcorrige U.N.',
        subject: 'pachanga',
      })
    );
    new ReadGap().reopen();

    await page.goto('/');
    await tab(page, 'Deudas').click();
    const waiting = page.getByTestId('waiting-bizums');
    await waiting.getByRole('button', { name: 'Leer ahora' }).click();
    const item = waiting
      .getByTestId('waiting-bizum')
      .filter({ hasText: 'Zcorrige U.N.' });
    await expect(item).toContainText(
      'El importe no es un número de cuotas, pero el asunto menciona pachanga.'
    );

    // Rule that it pays one share of Zcorrige Uno; the 0,5 € over stays on the Bizum.
    await item.getByRole('button', { name: 'Pagar cuotas' }).click();
    const rule = page.getByRole('dialog');
    await rule.getByLabel('Jugador').selectOption({ label: 'Zcorrige Uno' });
    await expect(rule).toContainText('Quedarán 0,5 € sin asignar en el Bizum.');
    await rule.getByRole('button', { name: 'Pagar 1 cuota' }).click();
    await expect(waiting).toContainText('No hay Bizums en espera.');

    await tab(page, 'Partido').click();
    const row = await openGameRow(page, gameId, 'Zcorrige Uno');
    await row.getByRole('button', { name: 'Pagado 4 € · Bizum' }).click();
    const detail = page.getByTestId('payment-detail');
    await expect(detail).toContainText('Bizum: sin asignar');
    await expect(detail).toContainText('0,5 €');

    // Undoing asks first, and the Bizum is on the list again, as any other.
    await detail.getByRole('button', { name: 'Deshacer pago' }).click();
    const undo = page.getByTestId('undo-bizum');
    await expect(undo).toContainText(
      'Se deshace y el Bizum vuelve a «Bizums en espera».'
    );
    await undo.getByRole('button', { name: 'Deshacer pago' }).click();
    await expect(row).not.toContainText('Pagado');

    await tab(page, 'Deudas').click();
    const again = page
      .getByTestId('waiting-bizum')
      .filter({ hasText: 'Zcorrige U.N.' });
    await expect(again).toContainText('Se deshizo su pago.');

    await again.getByRole('button', { name: 'Descartar' }).click();
    await page.getByRole('button', { name: 'Descartar para siempre' }).click();
    await expect(page.getByTestId('waiting-bizums')).toContainText(
      'No hay Bizums en espera.'
    );
  });
});
