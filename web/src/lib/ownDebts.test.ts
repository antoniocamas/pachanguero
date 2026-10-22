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
  method: 'efectivo',
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

  it("says a guest's share is the host's guest, naming a named one", () => {
    const lines = debtLines([
      debt({ kind: 'guest' }),
      debt({ kind: 'guest', forName: 'Adri' }),
    ]);
    expect(lines.map(l => l.tag)).toEqual([
      'tu invitado (+1)',
      'tu invitado Adri',
    ]);
    expect(new Set(lines.map(l => l.key)).size).toBe(2);
  });

  it('names the player whose share they answer for', () => {
    const [line] = debtLines([debt({ kind: 'other', forName: 'Adri' })]);
    expect(line.tag).toBe('por Adri');
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

describe('paymentLines, the method tag', () => {
  it.each([
    ['efectivo', 'Efectivo'],
    ['bizum', 'Bizum'],
    ['otro', 'Otro'],
  ] as const)('shows %s as %s', (method, label) => {
    expect(paymentLines([payment({ method })])[0].method).toBe(label);
  });

  it('keeps the method apart from the note about who paid', () => {
    const [line] = paymentLines([
      payment({ method: 'bizum', paidBy: { name: 'Ana López' } }),
    ]);

    expect(line).toMatchObject({
      method: 'Bizum',
      tag: 'pagado por Ana López',
    });
  });

  it('has no method on a debt', () => {
    expect(debtLines([debt()])[0].method).toBeNull();
  });
});

describe('viewSwitchAction', () => {
  const user = (over: Partial<SessionUser>): SessionUser => ({
    username: 'boss',
    role: 'admin',
    mode: 'admin',
    playerName: 'Antonio',
    canSwitchView: true,
    viewingAs: null,
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
