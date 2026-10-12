import { describe, expect, it } from 'vitest';
import type { HeldRow, OwnDebtRow, OwnPaymentRow } from '../api';
import {
  debtLines,
  heldLines,
  paymentLines,
  viewSwitchAction,
} from './ownDebts';
import type { SessionUser } from './sessionClient';

const debt = (over: Partial<OwnDebtRow> = {}): OwnDebtRow => ({
  gameId: 1,
  playedOn: '2026-10-07',
  label: null,
  amountCents: 500,
  kind: 'own',
  ...over,
});
const payment = (over: Partial<OwnPaymentRow> = {}): OwnPaymentRow => ({
  gameId: 1,
  playedOn: '2026-10-07',
  label: null,
  amountCents: 500,
  paidOn: '2026-10-09',
  kind: 'own',
  paidBy: null,
  ...over,
});

describe('debtLines', () => {
  it('shows the own share as "tu parte" with its amount in euros', () => {
    const [line] = debtLines([debt()]);
    expect(line.tag).toBe('tu parte');
    expect(line.amount).toBe('5 €');
    expect(line.date).toMatch(/7/);
  });

  it('shows a guest share as "invitado", with no name', () => {
    const lines = debtLines([debt({ kind: 'guest' }), debt({ kind: 'guest' })]);
    expect(lines.map(l => l.tag)).toEqual(['invitado', 'invitado']);
    expect(new Set(lines.map(l => l.key)).size).toBe(2);
  });

  it('is empty when nothing is owed', () => {
    expect(debtLines([])).toEqual([]);
    expect(heldLines([])).toEqual([]);
  });
});

describe('heldLines', () => {
  it('names who pays the share, in its own list', () => {
    const row: HeldRow = {
      gameId: 2,
      playedOn: '2026-09-23',
      label: null,
      amountCents: 500,
      holderName: 'Ana López',
    };
    expect(heldLines([row])[0].tag).toBe('lo paga Ana López');
    expect(heldLines([row])[0].amount).toBe('5 €');
  });
});

describe('paymentLines', () => {
  it('shows the game date and the payment date, in the order the server gave', () => {
    const lines = paymentLines([
      payment({ gameId: 3, paidOn: '2026-10-09' }),
      payment({ gameId: 2, playedOn: '2026-09-30', paidOn: '2026-10-02' }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].date).toContain('pagado el');
    expect(lines[0].tag).toBeNull();
  });

  it('notes a guest, a host who paid and a third person', () => {
    const tags = paymentLines([
      payment({ kind: 'guest' }),
      payment({ paidBy: { name: 'Ana López' } }),
      payment({ paidBy: 'other' }),
    ]).map(l => l.tag);
    expect(tags).toEqual([
      'invitado',
      'pagado por Ana López',
      'pagado por otra persona',
    ]);
  });
});

describe('viewSwitchAction', () => {
  const user = (over: Partial<SessionUser>): SessionUser => ({
    username: 'boss',
    role: 'admin',
    mode: 'admin',
    playerName: 'Antonio',
    canSwitchView: true,
    ...over,
  });

  it('offers an admin with a player the player view, saying whose', () => {
    const action = viewSwitchAction(user({}));
    expect(action).toMatchObject({
      kind: 'switch',
      to: 'regular',
      label: 'Ver como jugador',
    });
    expect(action).toHaveProperty('hint', expect.stringContaining('(Antonio)'));
  });

  it('offers an admin in the player view the way back', () => {
    expect(viewSwitchAction(user({ mode: 'regular' }))).toMatchObject({
      kind: 'switch',
      to: 'admin',
      label: 'Volver a administrador',
    });
  });

  it('tells an admin with no player that there is no player view', () => {
    expect(
      viewSwitchAction(user({ playerName: null, canSwitchView: false }))
    ).toMatchObject({ kind: 'unavailable' });
  });

  it('offers a regular user nothing', () => {
    expect(
      viewSwitchAction(
        user({ role: 'regular', mode: 'regular', canSwitchView: false })
      )
    ).toBeNull();
  });
});
