import type Database from 'better-sqlite3';
import { BankCatalogue } from '../bank/bank-catalogue.js';
import { FakeBankDialect } from '../bank/fake/fake-bank-dialect.js';
import type { AccountChoice } from '../bizum/ports.js';
import { TestDatabase } from '../db/test-support.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { BankConnectionRepository } from './bank-connection-repository.js';
import { BankSettingsRepository } from './bank-settings-repository.js';
import { BankSettingsService } from './bank-settings-service.js';
import { KeywordRepository } from './keyword-repository.js';

/** The four accounts the bank exposes in the requirements: three pockets and a second EUR one. */
export class FourAccounts {
  static readonly ALL: AccountChoice[] = [
    account('eur-1', 'EUR', '1111'),
    account('usd', 'USD', '2222'),
    account('gbp', 'GBP', '3333'),
    account('eur-2', 'EUR', '4444'),
  ];
}

function account(stableId: string, currency: string, last4: string) {
  return {
    stableId,
    sessionId: `uid-${stableId}`,
    currency,
    kind: 'CACC',
    last4,
  };
}

/** The settings service on a real database and a clock the test moves. */
export class BankSettingsRig {
  readonly conn: Database.Database = TestDatabase.create();
  readonly clock = new ManualClock(new Date('2026-10-19T10:00:00.000Z'));
  readonly connections = new BankConnectionRepository(this.conn);
  readonly settings = new BankSettingsRepository(this.conn);
  readonly keywords = new KeywordRepository(this.conn, this.settings);
  readonly service = new BankSettingsService(
    this.settings,
    this.keywords,
    this.connections,
    new BankCatalogue([new FakeBankDialect()]),
    this.clock
  );

  /** A connection holding these accounts, valid for 100 days from now. */
  connect(accounts: AccountChoice[] = FourAccounts.ALL): void {
    this.connections.save({
      bankId: 'fake',
      sessionId: 'session-1',
      validUntil: new Date(this.clock.now().getTime() + 100 * 86_400_000),
      connectedAt: this.clock.now(),
      accounts,
    });
  }
}
