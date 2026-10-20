import { expect, it } from 'vitest';
import {
  BankError,
  type AccountRef,
  type BankConnector,
  type BankFailure,
  type BankRef,
  type RawEntry,
} from '../bizum/ports.js';
import type { FakeControl } from './fake/fake-enable-banking-server.js';

/** What the contract needs to know about the world its connector is talking to. */
export interface ContractTarget {
  connector: BankConnector;
  /** An account of a session that stays open for the whole run. */
  account: AccountRef;
  dateFrom: string;
  /** How many entries a read from `dateFrom` yields, more than one page of them. */
  expectedCount: number;
  /** A date after today in the target's own time. */
  futureDate: string;
  /** Present for the fake bank: what a real bank would not let a test do. */
  control: FakeControl | null;
  consent: {
    bank: BankRef;
    registeredRedirect: string;
    unregisteredRedirect: string;
  } | null;
}

/**
 * One set of assertions about a bank connector, declared as vitest cases. The fake server runs
 * all of them on every commit; the sandbox runs only the read-only ones, from a standing session.
 * A disagreement between the two means the fake drifted.
 */
export class BankConnectorContract {
  constructor(private readonly target: () => Promise<ContractTarget>) {}

  declareReadOnlyCases(): void {
    it('reads every entry from the date on, across pages', async () => {
      const target = await this.target();
      const entries = await this.read(target);
      expect(entries).toHaveLength(target.expectedCount);
      expect(target.expectedCount).toBeGreaterThan(100);
    });

    it('reads the same references twice, none twice in one read', async () => {
      const target = await this.target();
      const first = this.references(await this.read(target));
      const second = this.references(await this.read(target, true));
      expect(new Set(first).size).toBe(first.length);
      expect(second).toEqual(first);
    });

    it('refuses a date in the future as rejected', async () => {
      const target = await this.target();
      await this.expectFailure(
        this.read(target, false, target.futureDate),
        'rejected',
        'DATE_FROM_IN_FUTURE'
      );
    });

    it('refuses an account that does not exist as rejected', async () => {
      const target = await this.target();
      await this.expectFailure(
        this.read(target, false, target.dateFrom, {
          stableId: 'none',
          sessionId: 'no-such-account',
        }),
        'rejected',
        'ACCOUNT_DOES_NOT_EXIST'
      );
    });
  }

  declareSessionCases(): void {
    it.each(['closed', 'expired', 'revoked'] as const)(
      'a %s session fails as session_ended with the bank code',
      async ended => {
        const { target, control, consent } = await this.fakeTarget();
        const session = await this.connect(target, control, consent);
        if (ended === 'closed') await target.connector.close(session.sessionId);
        if (ended === 'expired') control.expire(session.sessionId);
        if (ended === 'revoked') control.revoke(session.sessionId);

        await this.expectFailure(
          this.read(target, false, target.dateFrom, session.account),
          'session_ended',
          {
            closed: 'CLOSED_SESSION',
            expired: 'EXPIRED_SESSION',
            revoked: 'REVOKED_SESSION',
          }[ended]
        );
      }
    );

    it('a rate-limit answer fails as rate_limited with a time to retry', async () => {
      const { target, control } = await this.fakeTarget();
      control.rateLimitNext(1);

      const error = await this.failureOf(this.read(target));

      expect(error).toMatchObject({
        failure: 'rate_limited',
        code: 'ASPSP_RATE_LIMIT_EXCEEDED',
      });
      expect(error.retryAfter).toBeInstanceOf(Date);
    });

    it('begin with an unregistered redirect fails as misconfigured', async () => {
      const { target, consent } = await this.fakeTarget();
      await this.expectFailure(
        target.connector.begin(
          consent.unregisteredRedirect,
          'state-1',
          new Date(Date.now() + 86_400_000),
          consent.bank
        ),
        'misconfigured',
        'REDIRECT_URI_NOT_ALLOWED'
      );
    });

    it('complete gives a session, its validity and the accounts; a reused code fails as authorization_failed', async () => {
      const { target, control, consent } = await this.fakeTarget();
      const url = await target.connector.begin(
        consent.registeredRedirect,
        'state-2',
        new Date(Date.now() + 86_400_000),
        consent.bank
      );
      const { code } = await control.approve(url);

      const session = await target.connector.complete(code!);

      expect(session.sessionId).not.toBe('');
      expect(session.validUntil.getTime()).toBeGreaterThan(0);
      expect(session.accounts.length).toBeGreaterThan(0);
      await this.expectFailure(
        target.connector.complete(code!),
        'authorization_failed',
        'WRONG_AUTHORIZATION_CODE'
      );
    });

    it('a late code fails as authorization_failed', async () => {
      const { target, control, consent } = await this.fakeTarget();
      const url = await target.connector.begin(
        consent.registeredRedirect,
        'state-3',
        new Date(Date.now() + 86_400_000),
        consent.bank
      );
      const { code } = await control.approve(url);
      control.advance(61_000);

      await this.expectFailure(
        target.connector.complete(code!),
        'authorization_failed',
        'EXPIRED_AUTHORIZATION_CODE'
      );
    });
  }

  private async fakeTarget() {
    const target = await this.target();
    if (target.control === null || target.consent === null) {
      throw new Error('This case needs the fake bank');
    }
    return { target, control: target.control, consent: target.consent };
  }

  /** A fresh session by way of the consent page, and its first account. */
  private async connect(
    target: ContractTarget,
    control: FakeControl,
    consent: NonNullable<ContractTarget['consent']>
  ): Promise<{ sessionId: string; account: AccountRef }> {
    const url = await target.connector.begin(
      consent.registeredRedirect,
      `state-${Math.random()}`,
      new Date(Date.now() + 86_400_000),
      consent.bank
    );
    const { code } = await control.approve(url);
    const session = await target.connector.complete(code!);
    const first = session.accounts[0];
    return {
      sessionId: session.sessionId,
      account: {
        stableId: String(first.identification_hash),
        sessionId: String(first.uid),
      },
    };
  }

  private async read(
    target: ContractTarget,
    deep = false,
    dateFrom = target.dateFrom,
    account = target.account
  ): Promise<RawEntry[]> {
    const found: RawEntry[] = [];
    for await (const entry of target.connector.entries(account, dateFrom, {
      deep,
    })) {
      found.push(entry);
    }
    return found;
  }

  private references(entries: RawEntry[]): string[] {
    return entries.map(entry => String(entry.entry_reference));
  }

  private async failureOf(attempt: Promise<unknown>): Promise<BankError> {
    try {
      await attempt;
    } catch (error) {
      if (error instanceof BankError) return error;
      throw error;
    }
    throw new Error('Expected a BankError, but the call succeeded');
  }

  private async expectFailure(
    attempt: Promise<unknown>,
    failure: BankFailure,
    code: string
  ): Promise<void> {
    expect(await this.failureOf(attempt)).toMatchObject({ failure, code });
  }
}
