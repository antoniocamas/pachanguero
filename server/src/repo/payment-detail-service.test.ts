import { beforeEach, describe, expect, it } from 'vitest';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

describe('PaymentDetailService', () => {
  let rig: BizumFeedRig;
  let luis: number;

  beforeEach(() => {
    rig = new BizumFeedRig();
    rig.connect();
    luis = rig.player('Luis Pérez', 'Luis P.R.');
  });

  const incoming = (id: string, cents: number, concept: string | null = null) =>
    FakeBankEntries.incoming(
      id,
      '2026-10-12',
      cents,
      { name: 'Luis P.R.' },
      concept
    );

  it('refuses a payment that does not exist', () => {
    expect(() => rig.flow.paymentDetail.detail(999)).toThrow(
      'No existe ese pago'
    );
  });

  it('lists every payment of a Bizum that paid two shares, whichever is opened', async () => {
    const older = rig.owes(luis, '2026-10-05');
    const nearer = rig.owes(luis, '2026-10-06');
    await rig.arrive(incoming('r1', 800));

    const [first, second] = rig.payments();
    const detail = rig.flow.paymentDetail.detail(second.id);

    expect(detail.bizum?.payments.map(p => [p.gameId, p.amountCents])).toEqual([
      [nearer, 400],
      [older, 400],
    ]);
    expect(rig.flow.paymentDetail.detail(first.id).bizum?.payments).toEqual(
      detail.bizum?.payments
    );
  });

  it('names a guest share as nobody and the holder as the payer', async () => {
    const game = rig.flow.games.create(rig.seasonId, '2026-10-07').id;
    rig.flow.debts.insert(game, { hostPlayerId: luis, ordinal: 1 }, luis, 400);
    rig.flow.settler.settle(
      game,
      { hostPlayerId: luis, ordinal: 1 },
      { payerPlayerId: luis, paidOn: '2026-10-08', method: 'efectivo' }
    );

    const detail = rig.flow.paymentDetail.detail(rig.payments()[0].id);

    expect(detail.payment).toMatchObject({
      payerName: 'Luis Pérez',
      beneficiaryName: null,
      method: 'efectivo',
    });
    expect(detail.resolved).toBe('manual');
  });

  it('reads a payment whose handling row is missing as automatic with nothing unallocated', async () => {
    rig.owes(luis, '2026-10-07');
    await rig.arrive(incoming('r1', 400));
    rig.conn.prepare('DELETE FROM bizum_handling').run();

    expect(rig.flow.paymentDetail.detail(rig.payments()[0].id)).toMatchObject({
      resolved: 'automatic',
      bizum: { unallocatedCents: 0 },
    });
  });
});
