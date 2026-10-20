import { BankError, type BankFailure, type Clock } from './ports.js';
import type { BizumFeed, FeedSource, ReadCounts } from './feed.js';

/** Where a read's source comes from, and what to do with how it ended. */
export interface FeedSourceProvider {
  /** Null: not ready to read. */
  source(): FeedSource | null;
  succeeded(source: FeedSource): void;
  failed(error: BankError): void;
}

/** Runs a task later; the answer cancels it. */
export interface Scheduler {
  after(ms: number, task: () => void): () => void;
}

export type ReadResult = 'ok' | BankFailure | 'internal';

/** How the last read ended; codes and counts only. */
export interface FeedState {
  startedAt: Date;
  finishedAt: Date;
  result: ReadResult;
  code: string | null;
  counts: ReadCounts;
  rateLimitedUntil: Date | null;
}

export interface FeedStateStore {
  load(): FeedState | null;
  save(state: FeedState): void;
}

/** One line per read, saying how it went and never what it held. */
export interface ReadLog {
  line(text: string): void;
}

export type ReadRefusal =
  | { code: 'in_progress' }
  | { code: 'too_soon'; until: Date }
  | { code: 'rate_limited'; until: Date }
  | { code: 'not_ready' };

export type ReadOutcome =
  | { kind: 'read'; counts: ReadCounts }
  | { kind: 'refused'; refusal: ReadRefusal }
  | { kind: 'failed'; failure: ReadResult; code: string };

export interface LastRead extends FeedState {
  /** When the next scheduled read is due; null while nothing is scheduled. */
  nextAt: Date | null;
}

/** Reads one at a time: on a schedule that survives a restart, and on request. */
export class BankPoller {
  static readonly INTERVAL_MS = 6 * 3_600_000;
  static readonly MIN_GAP_MS = 5 * 60_000;
  static readonly START_DELAY_MS = 60_000;

  private reading = false;
  private cancel: (() => void) | null = null;
  private nextAt: Date | null = null;

  constructor(
    private readonly feed: BizumFeed,
    private readonly provider: FeedSourceProvider,
    private readonly state: FeedStateStore,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
    private readonly log: ReadLog
  ) {}

  /** The first read comes at the end of the interval since the last, or soon if that has passed. */
  start(): void {
    const now = this.clock.now().getTime();
    const last = this.state.load();
    const due = this.dueAfter(last);
    this.scheduleAt(
      due !== null && due.getTime() > now
        ? due
        : new Date(now + BankPoller.START_DELAY_MS)
    );
  }

  lastRead(): LastRead | null {
    const last = this.state.load();
    return last === null ? null : { ...last, nextAt: this.nextAt };
  }

  /** "Leer ahora": the scheduled read, run on request. */
  async requestRead(): Promise<ReadOutcome> {
    if (this.reading) return this.refused({ code: 'in_progress' });
    const now = this.clock.now();
    const last = this.state.load();
    if (last?.rateLimitedUntil && now < last.rateLimitedUntil) {
      return this.refused({
        code: 'rate_limited',
        until: last.rateLimitedUntil,
      });
    }
    if (last !== null) {
      const until = new Date(last.finishedAt.getTime() + BankPoller.MIN_GAP_MS);
      if (now < until) return this.refused({ code: 'too_soon', until });
    }
    const source = this.provider.source();
    if (source === null) return this.refused({ code: 'not_ready' });
    return this.run(source);
  }

  private refused(refusal: ReadRefusal): ReadOutcome {
    return { kind: 'refused', refusal };
  }

  /** The time after which the last read allows another, or null when there was none. */
  private dueAfter(last: FeedState | null): Date | null {
    if (last === null) return null;
    const due = last.finishedAt.getTime() + BankPoller.INTERVAL_MS;
    return new Date(Math.max(due, last.rateLimitedUntil?.getTime() ?? 0));
  }

  private scheduleAt(at: Date): void {
    this.cancel?.();
    this.nextAt = at;
    const wait = Math.max(at.getTime() - this.clock.now().getTime(), 0);
    this.cancel = this.scheduler.after(wait, () => void this.scheduled());
  }

  private async scheduled(): Promise<void> {
    const source = this.reading ? null : this.provider.source();
    if (source === null) {
      // Not ready, or a read is under way: nothing is recorded and the next interval tries again.
      this.scheduleAt(
        new Date(this.clock.now().getTime() + BankPoller.INTERVAL_MS)
      );
      return;
    }
    await this.run(source);
  }

  private async run(source: FeedSource): Promise<ReadOutcome> {
    this.reading = true;
    const startedAt = this.clock.now();
    try {
      const counts = await this.feed.read(source);
      this.provider.succeeded(source);
      this.finish(startedAt, 'ok', null, counts, null);
      return { kind: 'read', counts };
    } catch (error) {
      return this.failed(startedAt, error);
    } finally {
      this.reading = false;
      this.scheduleAt(
        this.dueAfter(this.state.load()) ??
          new Date(this.clock.now().getTime() + BankPoller.INTERVAL_MS)
      );
    }
  }

  private failed(startedAt: Date, error: unknown): ReadOutcome {
    if (error instanceof BankError) {
      this.provider.failed(error);
      const until =
        error.failure === 'rate_limited'
          ? (error.retryAfter ??
            new Date(this.clock.now().getTime() + BankPoller.INTERVAL_MS))
          : null;
      this.finish(startedAt, error.failure, error.code, this.empty(), until);
      return { kind: 'failed', failure: error.failure, code: error.code };
    }
    this.finish(startedAt, 'internal', 'INTERNAL', this.empty(), null);
    return { kind: 'failed', failure: 'internal', code: 'INTERNAL' };
  }

  private finish(
    startedAt: Date,
    result: ReadResult,
    code: string | null,
    counts: ReadCounts,
    rateLimitedUntil: Date | null
  ): void {
    this.state.save({
      startedAt,
      finishedAt: this.clock.now(),
      result,
      code,
      counts,
      rateLimitedUntil,
    });
    this.log.line(
      result === 'ok'
        ? `bank read ok: ${counts.entries} entries, ${counts.kept} kept, ${counts.discarded} discarded`
        : `bank read failed: ${result} ${code}`
    );
  }

  private empty(): ReadCounts {
    return {
      entries: 0,
      kept: 0,
      discarded: 0,
      notBizum: 0,
      pending: 0,
      unidentified: 0,
      known: 0,
    };
  }
}
