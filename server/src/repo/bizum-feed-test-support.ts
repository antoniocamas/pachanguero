import { FakeBankConnector } from '../bank/fake/fake-bank-connector.js';
import { FakeBankDialect } from '../bank/fake/fake-bank-dialect.js';
import { BankCatalogue } from '../bank/bank-catalogue.js';
import type { Scheduler } from '../bizum/bank-poller.js';
import { BankPoller, type ReadLog } from '../bizum/bank-poller.js';
import { BizumFeed, type ReadCounts } from '../bizum/feed.js';
import { SqliteBankEntryLedger } from '../bizum/sqlite/sqlite-bank-entry-ledger.js';
import { SqliteBizumStore } from '../bizum/sqlite/sqlite-bizum-store.js';
import { SqliteFeedStateStore } from '../bizum/sqlite/sqlite-feed-state-store.js';
import { SqliteUnitOfWork } from '../bizum/sqlite/sqlite-unit-of-work.js';
import type { BizumDialect, RawEntry } from '../bizum/ports.js';
import { BizumRuleSet } from '../domain/bizum-rules.js';
import { AliasRepository } from './alias-repository.js';
import { BankConnectionRepository } from './bank-connection-repository.js';
import { BankFeedSource } from './bank-feed-source.js';
import { BankSettingsRepository } from './bank-settings-repository.js';
import { BankSettingsService } from './bank-settings-service.js';
import { BizumFactsReader } from './bizum-facts-reader.js';
import { BizumHandler } from './bizum-handler.js';
import { BizumHandlingRepository } from './bizum-handling-repository.js';
import { BizumSettlementService } from './bizum-settlement-service.js';
import { ContactRepository } from './contact-repository.js';
import { GameFlow } from './game-flow-test-support.js';
import { KeywordRepository } from './keyword-repository.js';

/** Timers a test fires by hand, remembering how long each was asked to wait. */
export class ManualScheduler implements Scheduler {
  readonly waits: number[] = [];
  private task: (() => void) | null = null;

  after(ms: number, task: () => void): () => void {
    this.waits.push(ms);
    this.task = task;
    return () => {
      if (this.task === task) this.task = null;
    };
  }

  get lastWait(): number | undefined {
    return this.waits.at(-1);
  }

  get pending(): boolean {
    return this.task !== null;
  }

  async fire(): Promise<void> {
    const task = this.task;
    this.task = null;
    task?.();
    await new Promise(resolve => setImmediate(resolve));
  }
}

export class RecordingLog implements ReadLog {
  readonly lines: string[] = [];

  line(text: string): void {
    this.lines.push(text);
  }
}

/** An incoming Bizum as the fake bank reports it. */
export class FakeBankEntries {
  static incoming(
    id: string,
    bookedAt: string,
    cents: number,
    from: { name?: string; phone?: string },
    concept: string | null = null
  ): RawEntry {
    return {
      id,
      kind: 'BIZUM_IN',
      state: 'DONE',
      bookedAt,
      cents,
      ccy: 'EUR',
      from: { name: from.name ?? null, phone: from.phone ?? null },
      to: {},
      concept,
    };
  }
}

/**
 * The feed wired like production on a real database: the real handler, rules, facts reader,
 * settlement and stores, a scripted bank, and a poller over the real settings. A season with a
 * share of 400 cents holds the dates of October 2026.
 */
export class BizumFeedRig {
  static readonly ACCOUNT = { stableId: 'h1', sessionId: 'uid-1' };

  readonly flow = new GameFlow();
  readonly conn = this.flow.conn;
  readonly clock = this.flow.clock;
  readonly connector = new FakeBankConnector(this.clock);
  readonly seasonId = this.flow.seasons.create({ name: '2026/2027' }).id;
  readonly handling = new BizumHandlingRepository(this.conn);
  readonly store = new SqliteBizumStore(this.conn, this.clock);
  readonly ledger = new SqliteBankEntryLedger(this.conn, this.clock);
  readonly feedState = new SqliteFeedStateStore(this.conn);
  readonly connections = new BankConnectionRepository(this.conn);
  readonly settingsRepository = new BankSettingsRepository(this.conn);
  readonly keywords = new KeywordRepository(this.conn, this.settingsRepository);
  readonly settings: BankSettingsService;
  readonly feed: BizumFeed;
  readonly scheduler = new ManualScheduler();
  readonly log = new RecordingLog();
  readonly poller: BankPoller;
  readonly endings: { ended: string[] } = { ended: [] };

  constructor(readonly dialect: BizumDialect = new FakeBankDialect()) {
    this.settings = new BankSettingsService(
      this.settingsRepository,
      this.keywords,
      this.connections,
      new BankCatalogue([dialect]),
      this.clock
    );
    const settlement = new BizumSettlementService(
      this.flow.settler,
      this.handling,
      this.clock
    );
    this.feed = new BizumFeed(
      new BizumHandler(
        new BizumFactsReader(
          this.flow.seasons,
          this.flow.players,
          new AliasRepository(this.conn),
          new ContactRepository(this.conn),
          this.flow.debts,
          this.keywords
        ),
        new BizumRuleSet(),
        settlement,
        this.settings
      ),
      this.store,
      this.ledger,
      new SqliteUnitOfWork(this.conn)
    );
    this.poller = new BankPoller(
      this.feed,
      new BankFeedSource(this.connector, this.settings, this.connections, {
        markEnded: error => this.endings.ended.push(error.code),
      }),
      this.feedState,
      this.clock,
      this.scheduler,
      this.log
    );
  }

  /** A connection holding one EUR account, the start date set: ready to read. */
  connect(startDate = '2026-09-01'): void {
    this.connections.save({
      bankId: this.dialect.id,
      sessionId: 'session-1',
      validUntil: new Date(this.clock.now().getTime() + 100 * 86_400_000),
      connectedAt: this.clock.now(),
      accounts: [
        {
          ...BizumFeedRig.ACCOUNT,
          currency: 'EUR',
          kind: 'CACC',
          last4: '1111',
        },
      ],
    });
    this.settings.update({ startDate });
  }

  /** Reads straight through the feed, bypassing the poller's timing. */
  read(dateFrom = '2026-09-01', deep = false): Promise<ReadCounts> {
    return this.feed.read({
      connector: this.connector,
      dialect: this.dialect,
      account: BizumFeedRig.ACCOUNT,
      dateFrom,
      deep,
    });
  }

  /** Bizums arriving from the bank, read through the real feed; those read before are known. */
  async arrive(...entries: RawEntry[]): Promise<void> {
    this.connector.scriptedEntries = [
      ...this.connector.scriptedEntries,
      ...entries,
    ];
    await this.read();
  }

  /** The id the kept Bizum with this reference was given. */
  idOf(reference: string): number {
    const row = this.conn
      .prepare('SELECT id FROM bizums WHERE reference = ?')
      .get(reference) as { id: number } | undefined;
    if (row === undefined) throw new Error(`No kept Bizum ${reference}`);
    return row.id;
  }

  /** A player known by the name the bank shows for them. */
  player(name: string, bizumName: string | null = null): number {
    const id = this.flow.players.add(this.flow.seasonId, name, 1).id;
    if (bizumName !== null) {
      this.flow.players.addBizumName(id, bizumName);
    }
    return id;
  }

  /** A played game on `playedOn` in which this player owes one share. */
  owes(playerId: number, playedOn: string): number {
    const gameId = this.flow.games.create(this.seasonId, playedOn).id;
    this.flow.participations.set(gameId, playerId, { signed_up: true });
    this.flow.played(gameId);
    return gameId;
  }

  payments(): {
    id: number;
    game_id: number;
    method: string;
    bizum_id: number | null;
    paid_on: string;
    amount_cents: number;
  }[] {
    return this.conn
      .prepare('SELECT * FROM payments ORDER BY id')
      .all() as ReturnType<BizumFeedRig['payments']>;
  }

  ledgerOutcomes(): Record<string, string> {
    const rows = this.conn
      .prepare('SELECT reference, outcome FROM bizum_entries')
      .all() as { reference: string; outcome: string }[];
    return Object.fromEntries(rows.map(r => [r.reference, r.outcome]));
  }

  keptReferences(): string[] {
    return (
      this.conn.prepare('SELECT reference FROM bizums ORDER BY id').all() as {
        reference: string;
      }[]
    ).map(r => r.reference);
  }

  /** The handling of the Bizum with this reference. */
  handlingOf(reference: string) {
    const row = this.conn
      .prepare('SELECT id FROM bizums WHERE reference = ?')
      .get(reference) as { id: number } | undefined;
    return row === undefined ? null : this.handling.get(row.id);
  }
}
