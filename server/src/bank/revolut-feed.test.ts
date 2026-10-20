import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawEntry } from '../bizum/ports.js';
import { BizumFeedRig } from '../repo/bizum-feed-test-support.js';
import { FakeFixtures } from './fake/fake-fixtures.js';
import { RevolutDialect } from './revolut-dialect.js';

const entry = (
  reference: string,
  bookedOn: string,
  amount: string,
  message: string,
  sender: string
): RawEntry => ({
  entry_reference: reference,
  status: 'BOOK',
  credit_debit_indicator: 'CRDT',
  transaction_amount: { amount, currency: 'EUR' },
  booking_date: bookedOn,
  value_date: bookedOn,
  remittance_information: [message, `Bizum payment from: ${sender}`],
});

describe('the feed over Revolut entries', () => {
  let rig: BizumFeedRig;

  beforeEach(() => {
    rig = new BizumFeedRig(new RevolutDialect());
    rig.connect();
  });

  it('works the example of the design: one discarded, one not a Bizum, one that settles two shares', async () => {
    const luis = rig.player('Luis Pérez', 'Luis P.R.');
    const earlier = rig.owes(luis, '2026-09-30');
    const later = rig.owes(luis, '2026-10-07');
    rig.connector.scriptedEntries = [
      entry('r3', '2026-10-12', '8.00', 'pachanga', 'Luis P.R.'),
      {
        entry_reference: 'r2',
        status: 'BOOK',
        credit_debit_indicator: 'CRDT',
        transaction_amount: { amount: '5.00', currency: 'EUR' },
        booking_date: '2026-10-11',
        remittance_information: ['Dinero de Ana'],
      },
      entry('r1', '2026-10-10', '4.50', 'cena?', 'Marta G.L.'),
    ];

    const counts = await rig.read();

    expect(counts).toMatchObject({
      entries: 3,
      kept: 1,
      discarded: 1,
      notBizum: 1,
    });
    expect(rig.ledgerOutcomes()).toEqual({
      r1: 'discarded',
      r2: 'not_bizum',
      r3: 'kept',
    });
    expect(rig.payments()).toMatchObject([
      { game_id: later, method: 'bizum', paid_on: '2026-10-12' },
      { game_id: earlier, method: 'bizum', paid_on: '2026-10-12' },
    ]);
    expect(rig.handlingOf('r3')).toMatchObject({
      status: 'settled',
      settledHow: 'automatic',
      unallocatedCents: 0,
    });

    rig.clock.advance(6 * 3_600_000);
    expect(await rig.read()).toMatchObject({ entries: 3, known: 3, kept: 0 });
  });

  describe('over the shared fixture', () => {
    let logged: unknown[][];
    const spies: ReturnType<typeof vi.spyOn>[] = [];

    beforeEach(() => {
      logged = [];
      for (const method of ['log', 'info', 'warn', 'error'] as const) {
        spies.push(
          vi.spyOn(console, method).mockImplementation((...args) => {
            logged.push(args);
          })
        );
      }
      rig.connector.scriptedEntries = new FakeFixtures().entries();
    });

    afterEach(() => {
      spies.splice(0).forEach(spy => spy.mockRestore());
    });

    it('hands every entry to the rules: all 104 Bizums are kept or discarded, the rest remembered as not Bizums', async () => {
      const counts = await rig.read('2000-01-01');

      expect(counts).toMatchObject({
        entries: 130,
        pending: 1,
        unidentified: 0,
        notBizum: 25,
        known: 0,
      });
      expect(counts.kept + counts.discarded).toBe(104);
      expect(Object.keys(rig.ledgerOutcomes())).toHaveLength(129);
    });

    it('logs one line of counts and holds no sender, subject, amount or reference', async () => {
      await rig.poller.requestRead();

      expect(rig.log.lines).toHaveLength(1);
      expect(rig.log.lines[0]).toMatch(
        /^bank read ok: \d+ entries, \d+ kept, \d+ discarded$/
      );
      const everything = JSON.stringify([rig.log.lines, logged]);
      for (const raw of new FakeFixtures().entries()) {
        const [message, from] = (raw.remittance_information as string[]) ?? [];
        expect(everything).not.toContain(String(raw.entry_reference));
        if (from?.startsWith('Bizum payment from: ')) {
          expect(everything).not.toContain(
            from.slice('Bizum payment from: '.length)
          );
        }
        if (message) expect(everything).not.toContain(message);
      }
    });
  });
});
