import {
  BankError,
  type AccountRef,
  type BankConnector,
  type BankRef,
  type Clock,
  type RawAccount,
  type RawEntry,
} from '../../bizum/ports.js';
import type { FakeAccountTemplate } from './fake-fixtures.js';

type Method = 'begin' | 'complete' | 'close' | 'entries';

/** An in-memory bank connector for service tests: scripted accounts and entries, no HTTP. */
export class FakeBankConnector implements BankConnector {
  static readonly CONSENT_DAYS = 179;

  readonly begun: {
    redirectUrl: string;
    state: string;
    validUntil: Date;
    bank: BankRef;
  }[] = [];
  readonly completed: string[] = [];
  readonly closed: string[] = [];
  readonly read: { account: AccountRef; dateFrom: string; deep: boolean }[] =
    [];

  /** The raw entries every read yields (filtered by `bookedAt` or `booking_date`). */
  scriptedEntries: RawEntry[] = [];
  accounts: FakeAccountTemplate[] = [];

  private failure: { error: BankError; on: Method | null } | null = null;
  private sessions = 0;
  private consents = 0;

  constructor(private readonly clock: Clock) {}

  /** The next call fails with this error: of the named method, or whichever comes first. */
  failNext(error: BankError, on: Method | null = null): void {
    this.failure = { error, on };
  }

  async begin(
    redirectUrl: string,
    state: string,
    validUntil: Date,
    bank: BankRef
  ): Promise<string> {
    this.throwIfArmed('begin');
    this.begun.push({ redirectUrl, state, validUntil, bank });
    return `https://bank.example/consent/${++this.consents}`;
  }

  async complete(code: string): Promise<{
    sessionId: string;
    validUntil: Date;
    accounts: RawAccount[];
  }> {
    this.throwIfArmed('complete');
    this.completed.push(code);
    const number = ++this.sessions;
    const validUntil = new Date(
      this.clock.now().getTime() + FakeBankConnector.CONSENT_DAYS * 86_400_000
    );
    return {
      sessionId: `session-${number}`,
      validUntil,
      accounts: this.accounts.map(({ identification_hash, ...details }) => ({
        uid: `uid-${number}-${identification_hash}`,
        identification_hash,
        details,
      })),
    };
  }

  async close(sessionId: string): Promise<void> {
    this.throwIfArmed('close');
    this.closed.push(sessionId);
  }

  async *entries(
    account: AccountRef,
    dateFrom: string,
    options: { deep: boolean }
  ): AsyncIterable<RawEntry> {
    this.throwIfArmed('entries');
    this.read.push({ account, dateFrom, deep: options.deep });
    for (const entry of this.scriptedEntries) {
      const booked = String(entry.bookedAt ?? entry.booking_date);
      if (booked >= dateFrom) yield entry;
    }
  }

  private throwIfArmed(method: Method): void {
    const armed = this.failure;
    if (armed === null || (armed.on !== null && armed.on !== method)) return;
    this.failure = null;
    throw armed.error;
  }
}
