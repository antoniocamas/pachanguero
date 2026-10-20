import type Database from 'better-sqlite3';
import { FakeBankConnector } from '../bank/fake/fake-bank-connector.js';
import { FakeBankDialect } from '../bank/fake/fake-bank-dialect.js';
import { FakeFixtures } from '../bank/fake/fake-fixtures.js';
import { TestDatabase } from '../db/test-support.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { PublicUrl } from '../domain/public-url.js';
import { BankAuthorizationRepository } from './bank-authorization-repository.js';
import { BankConnectionRepository } from './bank-connection-repository.js';
import {
  BankConnectionService,
  type BankChoice,
  type SetupCheck,
  type SetupProblem,
  type StateSource,
} from './bank-connection-service.js';

/** States that read state-1, state-2, …, so a test can name the one it uses. */
export class CountingStates implements StateSource {
  private count = 0;

  next(): string {
    return `state-${++this.count}`;
  }
}

export class StubSetup implements SetupCheck {
  constructor(public missing: SetupProblem[] = []) {}

  problems(): SetupProblem[] {
    return this.missing;
  }
}

export class StubChoice implements BankChoice {
  constructor(public dialect: FakeBankDialect | null = new FakeBankDialect()) {}

  current(): FakeBankDialect | null {
    return this.dialect;
  }
}

/** The connection service on a real database, a scripted bank and a clock the test moves. */
export class BankConnectionRig {
  static readonly PUBLIC_URL = 'https://pachanguero.example.org';

  readonly conn: Database.Database = TestDatabase.create();
  readonly clock = new ManualClock(new Date('2026-10-19T10:00:00.000Z'));
  readonly connector = new FakeBankConnector(this.clock);
  readonly authorizations = new BankAuthorizationRepository(this.conn);
  readonly connections = new BankConnectionRepository(this.conn);
  readonly setup = new StubSetup();
  readonly choice = new StubChoice();
  readonly service: BankConnectionService;

  constructor() {
    this.connector.accounts = new FakeFixtures().accounts();
    this.service = new BankConnectionService(
      this.connector,
      this.authorizations,
      this.connections,
      PublicUrl.of(BankConnectionRig.PUBLIC_URL),
      this.setup,
      this.choice,
      this.clock,
      new CountingStates()
    );
  }

  /** Starts an authorisation and completes it with the bank's answer; returns the outcome. */
  async connectAndApprove(
    state: string,
    code = 'code-1'
  ): Promise<ReturnType<BankConnectionService['complete']>> {
    await this.service.connect();
    return this.service.complete({ state, code, error: null });
  }
}
