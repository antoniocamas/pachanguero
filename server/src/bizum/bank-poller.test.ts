import { beforeEach, describe, expect, it } from 'vitest';
import {
  BankPoller,
  type FeedSourceProvider,
  type FeedState,
  type FeedStateStore,
  type ReadLog,
  type Scheduler,
} from './bank-poller.js';
import {
  BizumFeed,
  type BankEntryLedger,
  type FeedSource,
  type UnitOfWork,
} from './feed.js';
import type { BizumKey } from './model.js';
import {
  BankError,
  type BankConnector,
  type BizumDialect,
  type Clock,
  type RawEntry,
} from './ports.js';

const HOUR = 3_600_000;
const MINUTE = 60_000;

class Clockwork implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Timers a test fires by hand. */
class HandScheduler implements Scheduler {
  readonly waits: number[] = [];
  task: (() => void) | null = null;

  after(ms: number, task: () => void): () => void {
    this.waits.push(ms);
    this.task = task;
    return () => {
      if (this.task === task) this.task = null;
    };
  }

  async fire(): Promise<void> {
    const task = this.task;
    this.task = null;
    task?.();
    await new Promise(resolve => setImmediate(resolve));
  }
}

class MemoryState implements FeedStateStore {
  state: FeedState | null = null;
  load(): FeedState | null {
    return this.state;
  }
  save(state: FeedState): void {
    this.state = state;
  }
}

class Lines implements ReadLog {
  readonly lines: string[] = [];
  line(text: string): void {
    this.lines.push(text);
  }
}

/** A bank whose reads the test releases, or fails, by hand. */
class HeldBank implements BankConnector {
  reads = 0;
  scripted: RawEntry[] = [];
  failWith: BankError | null = null;
  private release: (() => void) | null = null;
  hold = false;

  async begin(): Promise<string> {
    return '';
  }
  async complete(): Promise<never> {
    throw new Error('not used');
  }
  async close(): Promise<void> {}

  async *entries(): AsyncIterable<RawEntry> {
    this.reads++;
    if (this.hold) {
      await new Promise<void>(resolve => (this.release = resolve));
    }
    if (this.failWith !== null) throw this.failWith;
    yield* this.scripted;
  }

  finish(): void {
    this.release?.();
  }
}

class Provider implements FeedSourceProvider {
  ready = true;
  readonly succeededWith: boolean[] = [];
  readonly failures: string[] = [];

  constructor(private readonly connector: BankConnector) {}

  source(): FeedSource | null {
    return this.ready
      ? {
          connector: this.connector,
          dialect: {} as BizumDialect,
          account: { stableId: 'h1', sessionId: 'uid-1' },
          dateFrom: '2026-09-01',
          deep: true,
        }
      : null;
  }
  succeeded(source: FeedSource): void {
    this.succeededWith.push(source.deep);
  }
  failed(error: BankError): void {
    this.failures.push(`${error.failure} ${error.code}`);
  }
}

class NothingStored implements UnitOfWork, BankEntryLedger {
  run<T>(work: () => T): T {
    return work();
  }
  has(_key: BizumKey): boolean {
    return false;
  }
  remember(): void {}
  dismiss(): void {}
}

describe('BankPoller', () => {
  let clock: Clockwork;
  let scheduler: HandScheduler;
  let state: MemoryState;
  let bank: HeldBank;
  let provider: Provider;
  let log: Lines;
  let poller: BankPoller;

  const lastRead = (hoursAgo: number, extra: Partial<FeedState> = {}) => {
    const finishedAt = new Date(clock.now().getTime() - hoursAgo * HOUR);
    state.state = {
      startedAt: finishedAt,
      finishedAt,
      result: 'ok',
      code: null,
      counts: {
        entries: 0,
        kept: 0,
        discarded: 0,
        notBizum: 0,
        pending: 0,
        unidentified: 0,
        known: 0,
      },
      rateLimitedUntil: null,
      ...extra,
    };
  };

  beforeEach(() => {
    clock = new Clockwork(new Date('2026-10-19T10:00:00.000Z'));
    scheduler = new HandScheduler();
    state = new MemoryState();
    bank = new HeldBank();
    provider = new Provider(bank);
    log = new Lines();
    const nothing = new NothingStored();
    poller = new BankPoller(
      new BizumFeed(
        { judge: () => ({ kind: 'discard' }) },
        {
          save: () => ({ id: 1 }) as never,
          find: () => null,
          remove: () => {},
        },
        nothing,
        nothing
      ),
      provider,
      state,
      clock,
      scheduler,
      log
    );
  });

  describe('starting', () => {
    it('reads a minute after start when it never read', () => {
      poller.start();

      expect(scheduler.waits).toEqual([BankPoller.START_DELAY_MS]);
    });

    it('waits for the interval since the last read when that is still ahead', () => {
      lastRead(2);

      poller.start();

      expect(scheduler.waits).toEqual([4 * HOUR]);
    });

    it('reads a minute after start when the interval has passed while the server was off', () => {
      lastRead(30);

      poller.start();

      expect(scheduler.waits).toEqual([BankPoller.START_DELAY_MS]);
    });

    it('waits for the rate limit to end when it ends after the interval', () => {
      lastRead(1, {
        result: 'rate_limited',
        rateLimitedUntil: new Date(clock.now().getTime() + 9 * HOUR),
      });

      poller.start();

      expect(scheduler.waits).toEqual([9 * HOUR]);
    });

    it('reports when the next read is due', () => {
      lastRead(2);

      poller.start();

      expect(poller.lastRead()?.nextAt).toEqual(
        new Date(clock.now().getTime() + 4 * HOUR)
      );
    });
  });

  describe('the schedule', () => {
    it('reads when the timer fires, records it, and schedules the next in six hours', async () => {
      poller.start();
      clock.advance(MINUTE);

      await scheduler.fire();

      expect(bank.reads).toBe(1);
      expect(poller.lastRead()).toMatchObject({ result: 'ok' });
      expect(scheduler.waits.at(-1)).toBe(6 * HOUR);
      expect(provider.succeededWith).toEqual([true]);
    });

    it('processes a Bizum within a day: the interval is shorter than 24 hours', () => {
      expect(BankPoller.INTERVAL_MS).toBeLessThanOrEqual(24 * HOUR);
    });

    it('records nothing when not ready, and tries again at the next interval', async () => {
      provider.ready = false;
      poller.start();

      await scheduler.fire();

      expect(bank.reads).toBe(0);
      expect(state.state).toBeNull();
      expect(scheduler.waits.at(-1)).toBe(6 * HOUR);
    });

    it('holds a rate limit until the bank says, and schedules after it', async () => {
      bank.failWith = new BankError(
        'rate_limited',
        'ASPSP_RATE_LIMIT_EXCEEDED',
        new Date(clock.now().getTime() + 8 * HOUR)
      );
      poller.start();

      await scheduler.fire();

      expect(poller.lastRead()).toMatchObject({
        result: 'rate_limited',
        code: 'ASPSP_RATE_LIMIT_EXCEEDED',
      });
      expect(scheduler.waits.at(-1)).toBe(8 * HOUR);
    });

    it('tells the provider a session ended, and records the failure', async () => {
      bank.failWith = new BankError('session_ended', 'CLOSED_SESSION');
      poller.start();

      await scheduler.fire();

      expect(provider.failures).toEqual(['session_ended CLOSED_SESSION']);
      expect(poller.lastRead()).toMatchObject({
        result: 'session_ended',
        code: 'CLOSED_SESSION',
      });
    });

    it('records an unexpected failure as internal, by a fixed code', async () => {
      bank.failWith = new Error('secret detail') as never;
      poller.start();

      await scheduler.fire();

      expect(poller.lastRead()).toMatchObject({
        result: 'internal',
        code: 'INTERNAL',
      });
      expect(log.lines).toEqual(['bank read failed: internal INTERNAL']);
    });
  });

  describe('a forced read', () => {
    it('reads at once and moves the next scheduled read six hours after its end', async () => {
      lastRead(1);
      poller.start();

      const outcome = await poller.requestRead();

      expect(outcome).toMatchObject({ kind: 'read' });
      expect(bank.reads).toBe(1);
      expect(scheduler.waits.at(-1)).toBe(6 * HOUR);
    });

    it('is refused while a read is in progress', async () => {
      bank.hold = true;
      const first = poller.requestRead();
      await new Promise(resolve => setImmediate(resolve));

      expect(await poller.requestRead()).toEqual({
        kind: 'refused',
        refusal: { code: 'in_progress' },
      });
      expect(bank.reads).toBe(1);

      bank.finish();
      await first;
    });

    it('is refused for five minutes after the last read, saying until when', async () => {
      lastRead(0);
      clock.advance(2 * MINUTE);

      const outcome = await poller.requestRead();

      expect(outcome).toEqual({
        kind: 'refused',
        refusal: {
          code: 'too_soon',
          until: new Date(
            state.state!.finishedAt.getTime() + BankPoller.MIN_GAP_MS
          ),
        },
      });
      expect(bank.reads).toBe(0);
    });

    it('may read again once the gap has passed', async () => {
      lastRead(0);
      clock.advance(5 * MINUTE);

      expect(await poller.requestRead()).toMatchObject({ kind: 'read' });
    });

    it('is refused while the bank asks to wait, saying until when', async () => {
      const until = new Date(clock.now().getTime() + 3 * HOUR);
      lastRead(1, { result: 'rate_limited', rateLimitedUntil: until });

      expect(await poller.requestRead()).toEqual({
        kind: 'refused',
        refusal: { code: 'rate_limited', until },
      });
    });

    it('may read once the rate limit has ended', async () => {
      lastRead(7, {
        result: 'rate_limited',
        rateLimitedUntil: new Date(clock.now().getTime() - HOUR),
      });

      expect(await poller.requestRead()).toMatchObject({ kind: 'read' });
    });

    it('is refused when the setup is not complete', async () => {
      provider.ready = false;

      expect(await poller.requestRead()).toEqual({
        kind: 'refused',
        refusal: { code: 'not_ready' },
      });
    });

    it('refuses in the order in progress, rate limited, too soon, not ready', async () => {
      provider.ready = false;
      lastRead(0, {
        result: 'rate_limited',
        rateLimitedUntil: new Date(clock.now().getTime() + HOUR),
      });

      expect(await poller.requestRead()).toMatchObject({
        refusal: { code: 'rate_limited' },
      });
    });

    it('answers a failed read with the failure, never throwing', async () => {
      bank.failWith = new BankError('unavailable', 'TIMEOUT');

      expect(await poller.requestRead()).toEqual({
        kind: 'failed',
        failure: 'unavailable',
        code: 'TIMEOUT',
      });
    });

    it('runs one read at a time even when the timer fires during it', async () => {
      bank.hold = true;
      poller.start();
      const forced = poller.requestRead();
      await new Promise(resolve => setImmediate(resolve));

      await scheduler.fire();
      bank.finish();
      await forced;

      expect(bank.reads).toBe(1);
    });
  });

  describe('the log', () => {
    it('holds one line of codes and counts for a read that went well', async () => {
      await poller.requestRead();

      expect(log.lines).toEqual([
        'bank read ok: 0 entries, 0 kept, 0 discarded',
      ]);
    });

    it('holds one line with the failure and its code', async () => {
      bank.failWith = new BankError('session_ended', 'CLOSED_SESSION');

      await poller.requestRead();

      expect(log.lines).toEqual([
        'bank read failed: session_ended CLOSED_SESSION',
      ]);
    });
  });
});
