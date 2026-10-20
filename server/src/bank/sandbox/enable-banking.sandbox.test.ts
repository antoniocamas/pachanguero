import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { BizumFeed } from '../../bizum/feed.js';
import type { BizumPolicy } from '../../bizum/ports.js';
import { SqliteBankEntryLedger } from '../../bizum/sqlite/sqlite-bank-entry-ledger.js';
import { SqliteBizumStore } from '../../bizum/sqlite/sqlite-bizum-store.js';
import { SqliteUnitOfWork } from '../../bizum/sqlite/sqlite-unit-of-work.js';
import { TestDatabase } from '../../db/test-support.js';
import { EnvFileLoader } from '../../env-file-loader.js';
import { SystemClock } from '../../domain/clock.js';
import {
  BankConnectorContract,
  type ContractTarget,
} from '../bank-connector-contract.js';
import { EnableBankingConfig } from '../enable-banking-config.js';
import { EnableBankingConnector } from '../enable-banking-connector.js';
import { EnableBankingToken } from '../enable-banking-token.js';
import { RevolutDialect } from '../revolut-dialect.js';
import {
  SandboxGuard,
  SandboxSettings,
} from './sandbox-settings-test-support.js';

/**
 * The contract's read-only cases through the real connector against the bank's sandbox, from a
 * standing session. It only reads: closing the session would end it, and a person must approve
 * a new one. Opt-in, run by `npm run test:sandbox`; skipped with a message when not configured.
 */
new EnvFileLoader(
  process.env,
  join(fileURLToPath(import.meta.url), '../../../../../.env')
).apply([]);

const settings = SandboxSettings.fromEnv(process.env);
const skip = settings.skipMessage();
// A skipped suite says why in its own name, which the verbose reporter prints.
if (skip !== null) {
  describe('Enable Banking sandbox', () => {
    it.skip(skip, () => undefined);
  });
}

describe.runIf(skip === null)('Enable Banking sandbox', () => {
  const clock = new SystemClock();
  let target: ContractTarget;

  beforeAll(async () => {
    const production = EnableBankingConfig.fromEnv(process.env);
    const guard = new SandboxGuard(settings, production);
    const refusal = guard.refusal();
    if (refusal !== null) throw new Error(refusal);

    const config = EnableBankingConfig.of({
      appId: settings.appId,
      privateKey: settings.privateKey,
    });
    const token = new EnableBankingToken(
      config.appId,
      config.privateKey,
      clock
    );
    const connector = new EnableBankingConnector(config, token, clock);

    const session = await fetch(
      `${config.apiUrl}/sessions/${encodeURIComponent(settings.sessionId)}`,
      { headers: { authorization: `Bearer ${await token.sign()}` } }
    );
    const sessionRefusal = guard.sessionRefusal(
      session.status,
      (await session.json().catch(() => ({}))) as { status?: unknown }
    );
    if (sessionRefusal !== null) throw new Error(sessionRefusal);

    const account = {
      stableId: settings.accountHash,
      sessionId: settings.accountUid,
    };
    let counted = 0;
    for await (const entry of connector.entries(account, settings.dateFrom, {
      deep: true,
    })) {
      if (entry) counted++;
    }
    const fixtureRefusal = guard.fixtureRefusal(counted);
    if (fixtureRefusal !== null) throw new Error(fixtureRefusal);

    target = {
      connector,
      account,
      dateFrom: settings.dateFrom,
      expectedCount: settings.expectedCount,
      futureDate: new Date(clock.now().getTime() + 2 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      control: null,
      consent: null,
    };
  });

  new BankConnectorContract(async () => target).declareReadOnlyCases();

  /** Keeps every Bizum and does nothing more: what is read is what the feed handles. */
  class KeepsEverything implements BizumPolicy {
    judge(): ReturnType<BizumPolicy['judge']> {
      return { kind: 'keep', afterKept: () => undefined };
    }
  }

  const feedOver = () => {
    const conn = TestDatabase.create();
    return {
      conn,
      feed: new BizumFeed(
        new KeepsEverything(),
        new SqliteBizumStore(conn, clock),
        new SqliteBankEntryLedger(conn, clock),
        new SqliteUnitOfWork(conn)
      ),
    };
  };
  const read = (feed: BizumFeed, dateFrom: string) =>
    feed.read({
      connector: target.connector,
      dialect: new RevolutDialect(),
      account: target.account,
      dateFrom,
      deep: false,
    });

  it('handles nothing twice: a second read of the same account finds every entry known', async () => {
    const { feed } = feedOver();

    const first = await read(feed, target.dateFrom);
    const second = await read(feed, target.dateFrom);

    expect(first.known).toBe(0);
    expect(second).toMatchObject({ kept: 0, discarded: 0, notBizum: 0 });
    expect(second.known).toBe(first.kept + first.discarded + first.notBizum);
  });

  it('handles nothing booked before the start date', async () => {
    const { conn, feed } = feedOver();
    const lateStart = new Date(clock.now().getTime() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await read(feed, lateStart);

    const early = conn
      .prepare('SELECT COUNT(*) AS n FROM bizums WHERE booked_on < ?')
      .get(lateStart) as { n: number };
    expect(early.n).toBe(0);
  });
});
