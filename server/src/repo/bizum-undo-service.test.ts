import { beforeEach, describe, expect, it } from 'vitest';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

describe('BizumUndoService', () => {
  let rig: BizumFeedRig;
  let luis: number;

  beforeEach(() => {
    rig = new BizumFeedRig();
    rig.connect();
    luis = rig.player('Luis Pérez', 'Luis P.R.');
  });

  const incoming = (id: string, cents: number) =>
    FakeBankEntries.incoming(id, '2026-10-12', cents, { name: 'Luis P.R.' });

  const inBothTables = () =>
    rig.conn
      .prepare(
        `SELECT 1 FROM share_debts d JOIN payments p
            ON p.game_id = d.game_id AND p.beneficiary_player_id = d.beneficiary_player_id`
      )
      .all();

  it('refuses a payment that is not of that game', async () => {
    const game = rig.owes(luis, '2026-10-07');
    await rig.arrive(incoming('r1', 400));

    expect(() =>
      rig.flow.bizumUndo.undoPayment(game + 1, rig.payments()[0].id)
    ).toThrow('Ese pago no es de este partido');
    expect(rig.payments()).toHaveLength(1);
  });

  it('leaves every share in debts or in payments, never both, after undoing a Bizum of two', async () => {
    rig.owes(luis, '2026-10-05');
    rig.owes(luis, '2026-10-06');
    await rig.arrive(incoming('r1', 800));
    const [payment] = rig.payments();

    rig.flow.bizumUndo.undoPayment(payment.game_id, payment.id);

    expect(inBothTables()).toEqual([]);
    expect(rig.flow.debts.anyOutstanding(payment.game_id)).toBe(true);
    expect(rig.payments()).toEqual([]);
  });

  it('settles the Bizum again from a later played game, as any waiting one', async () => {
    const game = rig.owes(luis, '2026-10-07');
    await rig.arrive(incoming('r1', 400));
    const [payment] = rig.payments();
    rig.flow.bizumUndo.undoPayment(game, payment.id);

    rig.owes(luis, '2026-10-09');

    expect(rig.handlingOf('r1')).toMatchObject({ status: 'settled' });
  });

  it('keeps the Bizum known, so it is never read again', async () => {
    const game = rig.owes(luis, '2026-10-07');
    await rig.arrive(incoming('r1', 400));
    rig.flow.bizumUndo.undoPayment(game, rig.payments()[0].id);

    await rig.read();

    expect(rig.ledgerOutcomes()).toEqual({ r1: 'kept' });
    expect(rig.keptReferences()).toEqual(['r1']);
  });
});
