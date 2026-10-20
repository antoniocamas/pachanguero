import type { Page } from '@playwright/test';
import {
  ConnectedBank,
  READ_ACCOUNT,
  ReadGap,
  incomingBizum,
} from '../support/bank-setup';
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

  test('a Bizum booked before the games it pays offers the later games, and the organiser pays them', async ({
    page,
    request,
  }) => {
    const { gameId } = await new PayableGame(request).played([
      'Zprepaga Uno',
      'Zprepaga Dos',
    ]);
    await new ConnectedBank(request).ensure();
    // The game is played on the 27th of September of the season; the Bizum arrived on the 1st.
    const now = new Date();
    const year =
      now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const set = await request.put('/api/bank/settings', {
      data: { accountStableId: READ_ACCOUNT, startDate: `${year}-09-01` },
    });
    expect(set.ok(), await set.text()).toBeTruthy();
    await new FakeBank().addEntry({
      ...incomingBizum({
        reference: 'E2E-PREPAID-1',
        amount: '4.00',
        sender: 'Zprepaga U.N.',
        subject: '',
      }),
      booking_date: `${year}-09-01`,
      value_date: `${year}-09-01`,
    });
    new ReadGap().reopen();

    await page.goto('/');
    await tab(page, 'Deudas').click();
    const waiting = page.getByTestId('waiting-bizums');
    await waiting.getByRole('button', { name: 'Leer ahora' }).click();
    const item = waiting
      .getByTestId('waiting-bizum')
      .filter({ hasText: 'Zprepaga U.N.' });
    await item.getByRole('button', { name: 'Sí, es Zprepaga Uno' }).click();
    await page.getByRole('button', { name: 'Hecho' }).click();

    // The rules never pay a game after the booking; the organiser is told which ones there are.
    await expect(item).toContainText(
      'Debe 1 cuota de partidos posteriores al Bizum: 27 sept.'
    );
    await item.getByRole('button', { name: 'Pagar cuotas' }).click();
    const rule = page.getByRole('dialog');
    await expect(rule).toContainText(
      'Entre ellas, 1 de un partido posterior a la fecha del Bizum.'
    );
    await rule.getByRole('button', { name: 'Pagar 1 cuota' }).click();
    await expect(item).toHaveCount(0);

    await tab(page, 'Partido').click();
    const row = await openGameRow(page, gameId, 'Zprepaga Uno');
    await expect(row).toContainText('Pagado 4 € · Bizum');

    // Reading from the 1st brought the whole fixture in: leave nothing waiting for the next spec.
    const left = (await (await request.get('/api/bizums/waiting')).json()) as {
      id: number;
    }[];
    for (const bizum of left) {
      await request.post(`/api/bizums/${bizum.id}/dismiss`);
    }
  });
});
