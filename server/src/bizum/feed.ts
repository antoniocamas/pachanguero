import type { Bizum, BizumKey } from './model.js';
import type {
  AccountRef,
  BankConnector,
  BizumDialect,
  BizumPolicy,
  BizumStore,
  Recognised,
} from './ports.js';

/** Where one read comes from; given by the application for each read. */
export interface FeedSource {
  connector: BankConnector;
  dialect: BizumDialect;
  account: AccountRef;
  /** YYYY-MM-DD: what is booked before it is never handled. */
  dateFrom: string;
  /** Ask the bank for its whole history rather than what it returns by default. */
  deep: boolean;
}

/** One synchronous transaction: everything inside commits together or not at all. */
export interface UnitOfWork {
  run<T>(work: () => T): T;
}

export type EntryOutcome = 'kept' | 'discarded' | 'not_bizum';

/** The bank identifications already handled, whatever became of them. */
export interface BankEntryLedger {
  has(key: BizumKey): boolean;
  remember(key: BizumKey, outcome: EntryOutcome): void;
  /** A kept Bizum the organiser dismissed: it is never handled again. */
  dismiss(key: BizumKey): void;
}

export interface ReadCounts {
  entries: number;
  kept: number;
  discarded: number;
  notBizum: number;
  pending: number;
  unidentified: number;
  known: number;
}

/**
 * Reads the account, recognises each entry, and handles every one exactly once, oldest booking
 * first: the ledger row, the kept Bizum and whatever the policy does with it commit together.
 */
export class BizumFeed {
  constructor(
    private readonly policy: BizumPolicy,
    private readonly store: BizumStore,
    private readonly ledger: BankEntryLedger,
    private readonly work: UnitOfWork
  ) {}

  /** Throws what the bank throws; what was handled before the failure stays handled. */
  async read(source: FeedSource): Promise<ReadCounts> {
    const counts: ReadCounts = {
      entries: 0,
      kept: 0,
      discarded: 0,
      notBizum: 0,
      pending: 0,
      unidentified: 0,
      known: 0,
    };
    // Everything is collected first: a failure on a later page handles nothing of this read.
    const recognised: Recognised[] = [];
    for await (const raw of source.connector.entries(
      source.account,
      source.dateFrom,
      { deep: source.deep }
    )) {
      counts.entries++;
      recognised.push(source.dialect.recognise(raw, source.account));
    }
    for (const entry of recognised.filter(item => item.kind === 'ignore')) {
      this.ignore(entry, counts);
    }
    for (const bizum of this.oldestFirst(recognised)) {
      this.handle(bizum, source.dateFrom, counts);
    }
    return counts;
  }

  private ignore(
    entry: Extract<Recognised, { kind: 'ignore' }>,
    counts: ReadCounts
  ) {
    if (entry.why === 'pending') counts.pending++;
    else if (entry.why === 'unidentified') counts.unidentified++;
    else this.remember(entry.key, counts);
  }

  /** Not a Bizum: remembered by its key, when it has one, so it is not looked at again. */
  private remember(key: BizumKey | null, counts: ReadCounts): void {
    if (key === null) {
      counts.notBizum++;
      return;
    }
    this.work.run(() => {
      if (this.ledger.has(key)) {
        counts.known++;
        return;
      }
      this.ledger.remember(key, 'not_bizum');
      counts.notBizum++;
    });
  }

  private oldestFirst(recognised: Recognised[]): Bizum[] {
    return recognised
      .flatMap(item => (item.kind === 'bizum' ? [item.bizum] : []))
      .sort(
        (a, b) =>
          a.bookedOn.localeCompare(b.bookedOn) ||
          a.key.reference.localeCompare(b.key.reference)
      );
  }

  private handle(bizum: Bizum, dateFrom: string, counts: ReadCounts): void {
    this.work.run(() => {
      if (this.ledger.has(bizum.key)) {
        counts.known++;
        return;
      }
      // A start date moved back later can still read it, so nothing is remembered.
      if (bizum.bookedOn < dateFrom) return;
      const review = this.policy.judge(bizum);
      if (review.kind === 'discard') {
        this.ledger.remember(bizum.key, 'discarded');
        counts.discarded++;
        return;
      }
      review.afterKept(this.store.save(bizum));
      this.ledger.remember(bizum.key, 'kept');
      counts.kept++;
    });
  }
}
