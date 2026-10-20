import { beforeEach, describe, expect, it } from 'vitest';
import { Bizum, BizumKey } from '../bizum/model.js';
import type { OpenShare } from '../domain/bizum-rules.js';
import { BizumFeedRig } from './bizum-feed-test-support.js';
import { BizumSettlementService } from './bizum-settlement-service.js';

describe('BizumSettlementService', () => {
  let rig: BizumFeedRig;
  let service: BizumSettlementService;
  let luis: number;

  const stored = (amountCents: number, bookedOn = '2026-10-12') =>
    rig.store.save(
      new Bizum({
        key: new BizumKey('h1', `r-${amountCents}-${bookedOn}`),
        direction: 'incoming',
        bookedOn,
        amountCents,
        currency: 'EUR',
        sender: { name: 'Luis P.R.', phone: null },
        receiver: { name: null, phone: null },
        subject: null,
      })
    );
  const sharesOf = (...gameIds: number[]): OpenShare[] =>
    gameIds.map(gameId => {
      const debt = rig.flow.debts.list(gameId)[0];
      return {
        debtId: debt.id,
        gameId,
        playedOn: '2026-10-07',
        member: { playerId: luis },
        holderId: luis,
        amountCents: debt.amount_cents,
      };
    });

  beforeEach(() => {
    rig = new BizumFeedRig();
    service = new BizumSettlementService(
      rig.flow.settler,
      rig.handling,
      rig.clock
    );
    luis = rig.player('Luis Pérez', 'Luis P.R.');
  });

  it('pays each share as a Bizum payment linked to its Bizum and dated when the money arrived', () => {
    const first = rig.owes(luis, '2026-09-30');
    const second = rig.owes(luis, '2026-10-07');
    const bizum = stored(800);

    service.settle(bizum, luis, sharesOf(second, first), 'automatic');

    expect(rig.payments()).toMatchObject([
      {
        game_id: second,
        method: 'bizum',
        bizum_id: bizum.id,
        paid_on: '2026-10-12',
        amount_cents: 400,
      },
      {
        game_id: first,
        method: 'bizum',
        bizum_id: bizum.id,
        paid_on: '2026-10-12',
        amount_cents: 400,
      },
    ]);
    expect(rig.flow.debts.list(first)).toEqual([]);
    expect(rig.handling.get(bizum.id)).toMatchObject({
      status: 'settled',
      settledHow: 'automatic',
      unallocatedCents: 0,
      reason: null,
    });
  });

  it('records the unallocated rest when the Bizum is larger than the debts', () => {
    const game = rig.owes(luis, '2026-10-07');
    const bizum = stored(1000);

    service.settle(bizum, luis, sharesOf(game), 'organiser');

    expect(rig.handling.get(bizum.id)).toMatchObject({
      status: 'settled',
      settledHow: 'organiser',
      unallocatedCents: 600,
    });
  });

  it('pays nothing and waits when the debts add up to more than the Bizum', () => {
    const game = rig.owes(luis, '2026-10-07');
    const bizum = stored(300);

    service.settle(bizum, luis, sharesOf(game), 'automatic');

    expect(rig.payments()).toEqual([]);
    expect(rig.flow.debts.list(game)).toHaveLength(1);
    expect(rig.handling.get(bizum.id)).toMatchObject({
      status: 'waiting',
      reason: { code: 'amounts_differ' },
      sender: { kind: 'player', playerId: luis },
    });
  });

  it('writes a waiting row with its reason and sender, replacing an earlier one', () => {
    const bizum = stored(400);

    service.wait(
      bizum,
      { code: 'sender_unknown' },
      { kind: 'unknown', suggestions: [luis] }
    );
    service.wait(bizum, { code: 'kept' }, { kind: 'unknown', suggestions: [] });

    expect(rig.handling.waiting()).toHaveLength(1);
    expect(rig.handling.get(bizum.id)).toMatchObject({
      status: 'waiting',
      reason: { code: 'kept' },
    });
  });

  it('applies a verdict: settle pays, wait waits, discard does nothing', () => {
    const game = rig.owes(luis, '2026-10-07');
    const paid = stored(400);
    const waiting = stored(800, '2026-10-13');
    const ignored = stored(1200, '2026-10-14');

    service.apply(paid, {
      action: 'settle',
      rule: 'R3',
      playerId: luis,
      shares: sharesOf(game),
    });
    service.apply(waiting, {
      action: 'wait',
      rule: 'R7',
      reason: { code: 'sender_unknown' },
      sender: { kind: 'unknown', suggestions: [] },
    });
    service.apply(ignored, { action: 'discard', rule: 'R1' });

    expect(rig.handling.get(paid.id)?.status).toBe('settled');
    expect(rig.handling.get(waiting.id)?.status).toBe('waiting');
    expect(rig.handling.get(ignored.id)).toBeNull();
  });
});
