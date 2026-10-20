import { generateKeyPairSync } from 'node:crypto';
import { FakeBankConnector } from '../bank/fake/fake-bank-connector.js';
import { BankCatalogue } from '../bank/bank-catalogue.js';
import { FakeBankDialect } from '../bank/fake/fake-bank-dialect.js';
import { FakeFixtures } from '../bank/fake/fake-fixtures.js';
import { EnableBankingConfig } from '../bank/enable-banking-config.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { PublicUrl } from '../domain/public-url.js';
import { CountingStates } from '../repo/bank-connection-test-support.js';
import type { BankSettings } from '../server-app.js';

/** The bank settings for a route test: a scripted bank, a known state source and one dialect. */
export class BankRouteSettings {
  readonly connector: FakeBankConnector;
  readonly settings: BankSettings;

  constructor(clock: ManualClock) {
    this.connector = new FakeBankConnector(clock);
    this.connector.accounts = new FakeFixtures().accounts();
    this.settings = {
      config: EnableBankingConfig.of({
        appId: 'test-app',
        privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 })
          .privateKey.export({ type: 'pkcs8', format: 'pem' })
          .toString(),
      }),
      publicUrl: PublicUrl.of('https://pachanguero.example.org'),
      connector: this.connector,
      catalogue: new BankCatalogue([new FakeBankDialect()]),
      states: new CountingStates(),
    };
  }
}
