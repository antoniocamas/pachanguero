import type { Bizum, BizumKey } from './model.js';

/** An entry or account exactly as the connector received it; read only by the dialect. */
export type RawEntry = Readonly<Record<string, unknown>>;
export type RawAccount = Readonly<Record<string, unknown>>;

/** The institution the connector asks consent from. */
export interface BankRef {
  readonly name: string;
  readonly country: string;
}

/** An account as offered for the organiser's choice; `stableId` survives renewals, `sessionId` does not. */
export interface AccountChoice {
  readonly stableId: string;
  readonly sessionId: string;
  readonly currency: string;
  readonly kind: string;
  readonly last4: string;
}
export type AccountRef = Pick<AccountChoice, 'stableId' | 'sessionId'>;

export type IgnoreReason = 'not_a_bizum' | 'pending' | 'unidentified';
export type Recognised =
  | { kind: 'bizum'; bizum: Bizum }
  | { kind: 'ignore'; why: IgnoreReason; key: BizumKey | null };

export interface BizumDialect {
  readonly id: string;
  readonly displayName: string;
  readonly bank: BankRef;
  recognise(raw: RawEntry, account: AccountRef): Recognised;
  describeAccount(raw: RawAccount): AccountChoice;
}

export interface BankConnector {
  begin(
    redirectUrl: string,
    state: string,
    validUntil: Date,
    bank: BankRef
  ): Promise<string>;
  complete(code: string): Promise<{
    sessionId: string;
    validUntil: Date;
    accounts: RawAccount[];
  }>;
  close(sessionId: string): Promise<void>;
  entries(
    account: AccountRef,
    dateFrom: string,
    options: { deep: boolean }
  ): AsyncIterable<RawEntry>;
}

export interface StoredBizum {
  readonly id: number;
  readonly bizum: Bizum;
}
export type Review =
  { kind: 'discard' } | { kind: 'keep'; afterKept(stored: StoredBizum): void };
export interface BizumPolicy {
  judge(bizum: Bizum): Review;
}
export interface BizumStore {
  save(bizum: Bizum): StoredBizum;
  find(id: number): StoredBizum | null;
  remove(id: number): void;
}

/** A failure of the aggregator, classified so the core can react without knowing it. */
export type BankFailure =
  | 'session_ended'
  | 'rate_limited'
  | 'authorization_failed'
  | 'misconfigured'
  | 'rejected'
  | 'unavailable';

export class BankError extends Error {
  constructor(
    readonly failure: BankFailure,
    readonly code: string,
    readonly retryAfter: Date | null = null
  ) {
    super(`${failure}: ${code}`);
  }
}

/** The current moment; the same shape as the application's clock, so its implementations fit. */
export interface Clock {
  now(): Date;
}
