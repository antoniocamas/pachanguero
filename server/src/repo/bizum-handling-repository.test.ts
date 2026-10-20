import { beforeEach, describe, expect, it } from 'vitest';
import { Bizum, BizumKey } from '../bizum/model.js';
import { BizumFeedRig } from './bizum-feed-test-support.js';

describe('BizumHandlingRepository', () => {
  let rig: BizumFeedRig;
  const at = new Date('2026-10-19T10:00:00.000Z');

  const kept = (reference: string) =>
    rig.store.save(
      new Bizum({
        key: new BizumKey('h1', reference),
        direction: 'incoming',
        bookedOn: '2026-10-12',
        amountCents: 400,
        currency: 'EUR',
        sender: { name: 'Marta G.L.', phone: null },
        receiver: { name: null, phone: null },
        subject: null,
      })
    ).id;

  beforeEach(() => {
    rig = new BizumFeedRig();
  });

  it('knows nothing of a Bizum it was never told about', () => {
    expect(rig.handling.get(999)).toBeNull();
  });

  it('keeps a waiting Bizum with its reason, sender and time', () => {
    const id = kept('r1');

    rig.handling.markWaiting(
      id,
      { code: 'include_word', word: 'pachanga', wholeShares: false },
      { kind: 'ambiguous', playerIds: [1, 2] },
      at
    );

    expect(rig.handling.get(id)).toEqual({
      bizumId: id,
      status: 'waiting',
      reason: { code: 'include_word', word: 'pachanga', wholeShares: false },
      sender: { kind: 'ambiguous', playerIds: [1, 2] },
      unallocatedCents: 0,
      settledHow: null,
      updatedAt: at,
    });
  });

  it('turns a waiting Bizum into a settled one, with no reason left', () => {
    const id = kept('r1');
    rig.handling.markWaiting(
      id,
      { code: 'kept' },
      { kind: 'unknown', suggestions: [] },
      at
    );

    rig.handling.markSettled(id, 'organiser', 100, at);

    expect(rig.handling.get(id)).toMatchObject({
      status: 'settled',
      reason: null,
      sender: null,
      unallocatedCents: 100,
      settledHow: 'organiser',
    });
    expect(rig.handling.waiting()).toEqual([]);
  });

  it('lists only the waiting ones, in the order they began to wait', () => {
    const later = kept('r1');
    const earlier = kept('r2');
    const settled = kept('r3');
    const unknown = { kind: 'unknown', suggestions: [] } as const;
    rig.handling.markWaiting(
      later,
      { code: 'kept' },
      unknown,
      new Date('2026-10-19T12:00:00Z')
    );
    rig.handling.markWaiting(earlier, { code: 'kept' }, unknown, at);
    rig.handling.markSettled(settled, 'automatic', 0, at);

    expect(rig.handling.waiting().map(h => h.bizumId)).toEqual([
      earlier,
      later,
    ]);
  });

  it('reads a reason with a code nobody knows as kept', () => {
    const id = kept('r1');
    rig.conn
      .prepare(
        `INSERT INTO bizum_handling (bizum_id, status, reason_json, updated_at)
         VALUES (?, 'waiting', ?, ?)`
      )
      .run(
        id,
        JSON.stringify({
          reason: { code: 'from_the_future' },
          sender: { kind: 'unknown', suggestions: [] },
        }),
        at.toISOString()
      );

    expect(rig.handling.get(id)?.reason).toEqual({ code: 'kept' });
  });

  it('goes with its Bizum when that is removed', () => {
    const id = kept('r1');
    rig.handling.markSettled(id, 'automatic', 0, at);

    rig.store.remove(id);

    expect(rig.handling.get(id)).toBeNull();
  });

  describe('waiting by booking', () => {
    const keptOn = (reference: string, bookedOn: string) =>
      rig.store.save(
        new Bizum({
          key: new BizumKey('h1', reference),
          direction: 'incoming',
          bookedOn,
          amountCents: 400,
          currency: 'EUR',
          sender: { name: 'Marta G.L.', phone: null },
          receiver: { name: null, phone: null },
          subject: null,
        })
      ).id;

    const waits = (id: number) =>
      rig.handling.markWaiting(
        id,
        { code: 'kept' },
        { kind: 'unknown', suggestions: [] },
        at
      );

    it('lists the waiting ones oldest booking first, then by reference', () => {
      const late = keptOn('b', '2026-10-12');
      const early = keptOn('z', '2026-10-02');
      const tie = keptOn('a', '2026-10-12');
      const settled = keptOn('s', '2026-10-01');
      [late, early, tie].forEach(waits);
      rig.handling.markSettled(settled, 'automatic', 0, at);

      expect(rig.handling.waitingByBooking().map(h => h.bizumId)).toEqual([
        early,
        tie,
        late,
      ]);
    });

    it('lists those booked in a season on or after a date, and no other', () => {
      const season = rig.seasonId;
      const before = keptOn('a', '2026-10-06');
      const onDay = keptOn('b', '2026-10-07');
      const after = keptOn('c', '2026-10-20');
      const nextSeason = keptOn('d', '2027-09-02');
      const lastSeason = keptOn('e', '2026-08-31');
      [before, onDay, after, nextSeason, lastSeason].forEach(waits);

      expect(
        rig.handling
          .waitingInSeasonFrom(season, '2026-10-07')
          .map(h => h.bizumId)
      ).toEqual([onDay, after]);
    });
  });
});
