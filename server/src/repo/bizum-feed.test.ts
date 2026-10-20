import { beforeEach, describe, expect, it } from 'vitest';
import { FakeBankConnector } from '../bank/fake/fake-bank-connector.js';
import { FakeBankDialect } from '../bank/fake/fake-bank-dialect.js';
import { BizumFeed } from '../bizum/feed.js';
import type { Bizum } from '../bizum/model.js';
import {
  BankError,
  type AccountRef,
  type BizumPolicy,
  type RawEntry,
  type Review,
  type StoredBizum,
} from '../bizum/ports.js';
import { SqliteBankEntryLedger } from '../bizum/sqlite/sqlite-bank-entry-ledger.js';
import { SqliteBizumStore } from '../bizum/sqlite/sqlite-bizum-store.js';
import { SqliteUnitOfWork } from '../bizum/sqlite/sqlite-unit-of-work.js';
import { TestDatabase } from '../db/test-support.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { FakeBankEntries } from './bizum-feed-test-support.js';

/** A policy the test scripts: it keeps or discards by reference and records what it saw. */
class ScriptedPolicy implements BizumPolicy {
  readonly judged: string[] = [];
  readonly kept: StoredBizum[] = [];
  discard = new Set<string>();
  throwAfterKept = new Set<string>();

  judge(bizum: Bizum): Review {
    this.judged.push(bizum.key.reference);
    if (this.discard.has(bizum.key.reference)) return { kind: 'discard' };
    return {
      kind: 'keep',
      afterKept: stored => {
        this.kept.push(stored);
        if (this.throwAfterKept.has(bizum.key.reference)) {
          throw new Error('the application failed');
        }
      },
    };
  }
}

/** A bank that fails after yielding some entries, as a later page does. */
class FailingOnSecondPage extends FakeBankConnector {
  failing = true;

  async *entries(
    account: AccountRef,
    dateFrom: string,
    options: { deep: boolean }
  ): AsyncIterable<RawEntry> {
    let count = 0;
    for await (const entry of super.entries(account, dateFrom, options)) {
      if (this.failing && count++ === 2) {
        throw new BankError('unavailable', 'TIMEOUT');
      }
      yield entry;
    }
  }
}

/** A bank that does not filter by date, so the feed's own check is what is seen. */
class Unfiltered extends FailingOnSecondPage {
  async *entries(): AsyncIterable<RawEntry> {
    yield* this.scriptedEntries;
  }
}

const incoming = (
  id: string,
  bookedAt: string,
  extra: Partial<RawEntry> = {}
): RawEntry => ({
  ...FakeBankEntries.incoming(id, bookedAt, 400, { name: 'Marta G.L.' }),
  ...extra,
});

describe('BizumFeed over the SQLite stores', () => {
  const account = { stableId: 'h1', sessionId: 'uid-1' };
  let conn: ReturnType<typeof TestDatabase.create>;
  let clock: ManualClock;
  let connector: FailingOnSecondPage;
  let policy: ScriptedPolicy;
  let feed: BizumFeed;

  const read = (dateFrom = '2026-09-01') =>
    feed.read({
      connector,
      dialect: new FakeBankDialect(),
      account,
      dateFrom,
      deep: false,
    });
  const ledger = (): Record<string, string> =>
    Object.fromEntries(
      (
        conn.prepare('SELECT reference, outcome FROM bizum_entries').all() as {
          reference: string;
          outcome: string;
        }[]
      ).map(row => [row.reference, row.outcome])
    );
  const kept = (): string[] =>
    (
      conn.prepare('SELECT reference FROM bizums ORDER BY id').all() as {
        reference: string;
      }[]
    ).map(row => row.reference);

  beforeEach(() => {
    conn = TestDatabase.create();
    clock = new ManualClock(new Date('2026-10-19T10:00:00.000Z'));
    connector = new FailingOnSecondPage(clock);
    connector.failing = false;
    policy = new ScriptedPolicy();
    feed = new BizumFeed(
      policy,
      new SqliteBizumStore(conn, clock),
      new SqliteBankEntryLedger(conn, clock),
      new SqliteUnitOfWork(conn)
    );
  });

  describe('the handling table', () => {
    it('leaves a pending entry alone, to be read again once booked', async () => {
      connector.scriptedEntries = [
        incoming('p1', '2026-10-10', { state: 'PENDING' }),
      ];

      const counts = await read();

      expect(counts).toMatchObject({ entries: 1, pending: 1, kept: 0 });
      expect(ledger()).toEqual({});
      expect(kept()).toEqual([]);
    });

    it('counts an entry without an identification and remembers nothing', async () => {
      connector.scriptedEntries = [
        incoming('u1', '2026-10-10', { id: undefined }),
      ];

      const counts = await read();

      expect(counts).toMatchObject({ unidentified: 1 });
      expect(ledger()).toEqual({});
    });

    it('remembers what is not a Bizum by its key, and keeps nothing of it', async () => {
      connector.scriptedEntries = [
        incoming('c1', '2026-10-10', { kind: 'CARD' }),
      ];

      const counts = await read();

      expect(counts.notBizum).toBe(1);
      expect(ledger()).toEqual({ c1: 'not_bizum' });
    });

    it('does not look again at an entry the ledger holds, whatever its outcome', async () => {
      connector.scriptedEntries = [
        incoming('k1', '2026-10-10'),
        incoming('d1', '2026-10-11'),
      ];
      policy.discard.add('d1');
      await read();
      policy.judged.length = 0;

      const counts = await read();

      expect(counts).toMatchObject({ known: 2, kept: 0, discarded: 0 });
      expect(policy.judged).toEqual([]);
    });

    it('handles nothing booked before the start date, and remembers nothing', async () => {
      connector = new Unfiltered(clock);
      connector.scriptedEntries = [incoming('a1', '2026-08-31')];

      const counts = await read();

      expect(counts).toMatchObject({ entries: 1, kept: 0, discarded: 0 });
      expect(ledger()).toEqual({});
      expect(policy.judged).toEqual([]);
    });

    it('keeps the start date itself', async () => {
      connector.scriptedEntries = [incoming('s1', '2026-09-01')];

      await read();

      expect(kept()).toEqual(['s1']);
    });

    it('forgets what the policy discards, remembering only its key', async () => {
      connector.scriptedEntries = [incoming('d1', '2026-10-10')];
      policy.discard.add('d1');

      const counts = await read();

      expect(counts.discarded).toBe(1);
      expect(kept()).toEqual([]);
      expect(ledger()).toEqual({ d1: 'discarded' });
    });

    it('keeps what the policy keeps, tells it, and remembers it', async () => {
      connector.scriptedEntries = [incoming('k1', '2026-10-10')];

      const counts = await read();

      expect(counts.kept).toBe(1);
      expect(kept()).toEqual(['k1']);
      expect(ledger()).toEqual({ k1: 'kept' });
      expect(policy.kept).toHaveLength(1);
      expect(policy.kept[0].bizum.amountCents).toBe(400);
      expect(policy.kept[0].id).toBeGreaterThan(0);
    });
  });

  it('handles Bizums oldest booking first, then by reference', async () => {
    connector.scriptedEntries = [
      incoming('b', '2026-10-12'),
      incoming('z', '2026-10-10'),
      incoming('a', '2026-10-12'),
      incoming('m', '2026-10-01'),
    ];

    await read();

    expect(policy.judged).toEqual(['m', 'z', 'a', 'b']);
  });

  it('handles nothing of a read that fails on a later page, and all of the next', async () => {
    connector = new FailingOnSecondPage(clock);
    connector.scriptedEntries = [
      incoming('1', '2026-10-01'),
      incoming('2', '2026-10-02'),
      incoming('3', '2026-10-03'),
    ];

    await expect(read()).rejects.toMatchObject({ failure: 'unavailable' });
    expect(ledger()).toEqual({});
    expect(kept()).toEqual([]);

    connector.failing = false;
    const counts = await read();

    expect(counts).toMatchObject({ entries: 3, kept: 3, known: 0 });
    expect(ledger()).toEqual({ 1: 'kept', 2: 'kept', 3: 'kept' });
  });

  it('gives all known when the same entries are read twice', async () => {
    connector.scriptedEntries = [
      incoming('1', '2026-10-01'),
      incoming('2', '2026-10-02', { kind: 'CARD' }),
      incoming('3', '2026-10-03'),
    ];
    policy.discard.add('3');
    await read();

    const counts = await read();

    expect(counts).toMatchObject({
      entries: 3,
      known: 3,
      kept: 0,
      discarded: 0,
      notBizum: 0,
    });
  });

  it('rolls back only the entry whose follow-up fails, leaving the ones before it handled', async () => {
    connector.scriptedEntries = [
      incoming('1', '2026-10-01'),
      incoming('2', '2026-10-02'),
      incoming('3', '2026-10-03'),
    ];
    policy.throwAfterKept.add('2');

    await expect(read()).rejects.toThrow('the application failed');

    expect(kept()).toEqual(['1']);
    expect(ledger()).toEqual({ 1: 'kept' });

    policy.throwAfterKept.clear();
    const counts = await read();

    expect(counts).toMatchObject({ known: 1, kept: 2 });
    expect(kept()).toEqual(['1', '2', '3']);
  });

  it('keeps every field of a Bizum as the bank gave it', async () => {
    connector.scriptedEntries = [
      FakeBankEntries.incoming(
        'k1',
        '2026-10-12',
        450,
        { phone: '+34600000000' },
        'pachanga'
      ),
    ];

    await read();

    expect(
      new SqliteBizumStore(conn, clock).find(policy.kept[0].id)?.bizum
    ).toMatchObject({
      key: { account: 'h1', reference: 'k1' },
      direction: 'incoming',
      bookedOn: '2026-10-12',
      amountCents: 450,
      currency: 'EUR',
      sender: { name: null, phone: '+34600000000' },
      subject: 'pachanga',
    });
  });

  it('remembers a dismissed entry so it never comes back', async () => {
    connector.scriptedEntries = [incoming('k1', '2026-10-10')];
    await read();
    const store = new SqliteBizumStore(conn, clock);
    store.remove(policy.kept[0].id);
    new SqliteBankEntryLedger(conn, clock).dismiss(policy.kept[0].bizum.key);
    policy.judged.length = 0;

    const counts = await read();

    expect(ledger()).toEqual({ k1: 'dismissed' });
    expect(counts.known).toBe(1);
    expect(policy.judged).toEqual([]);
  });
});
