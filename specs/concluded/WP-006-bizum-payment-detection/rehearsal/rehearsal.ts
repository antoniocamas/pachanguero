/**
 * Throwaway tool for the one-time rehearsal on a copy of the production database.
 *
 *   npx tsx rehearsal.ts reset  --db <copy> --from 2026-09-01
 *   npx tsx rehearsal.ts report --db <copy>
 *
 * See README.md. It writes real names and amounts, so its files stay in the copy's folder,
 * outside the repository.
 */
import Database from 'better-sqlite3';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const SERVER_SRC = join(REPO_ROOT, 'server/src');

interface GroundPayment {
  paymentId: number;
  gameId: number;
  playedOn: string;
  beneficiaryId: number | null;
  holderId: number;
  guestOrdinal: number | null;
  payerId: number;
  amountCents: number;
  paidOn: string;
  method: string;
  beneficiaryName: string;
  payerName: string;
}

interface GroundTruth {
  from: string;
  takenAt: string;
  payments: GroundPayment[];
  /** Players who already had a Bizum name before the rehearsal. */
  bizumNamesAtReset: number[];
}

/** Reads the command line and refuses a database that is not a rehearsal copy. */
class RehearsalArguments {
  readonly command: string;
  readonly db: string;
  readonly folder: string;
  readonly from: string | null;

  constructor(argv: string[]) {
    this.command = argv[0] ?? '';
    const value = (flag: string): string | null => {
      const at = argv.indexOf(flag);
      return at === -1 ? null : (argv[at + 1] ?? null);
    };
    const db = value('--db');
    if (!['reset', 'report'].includes(this.command))
      throw new Error('Usage: rehearsal.ts reset|report --db <copy> [--from YYYY-MM-DD]');
    if (db === null) throw new Error('--db <copy> is required');
    this.db = resolve(db);
    this.folder = dirname(this.db);
    this.from = value('--from');
    this.guard();
  }

  private guard(): void {
    const inside = relative(REPO_ROOT, this.db);
    if (!inside.startsWith('..') && !inside.startsWith('/'))
      throw new Error('The copy must sit outside the repository');
    if (!existsSync(this.db)) throw new Error(`No such database: ${this.db}`);
    if (this.command === 'reset' && !/^\d{4}-\d{2}-\d{2}$/.test(this.from ?? ''))
      throw new Error('--from YYYY-MM-DD is required for reset');
  }

  get groundTruthFile(): string {
    return join(this.folder, 'ground-truth.json');
  }

  get reportFile(): string {
    return join(this.folder, 'report.md');
  }
}

/** The marker table that says a file is a rehearsal copy. */
class RehearsalMarker {
  static readonly TABLE = 'rehearsal_marker';

  static exists(conn: Database.Database): boolean {
    return (
      conn
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
        .get(RehearsalMarker.TABLE) !== undefined
    );
  }

  static write(conn: Database.Database, from: string): void {
    conn.exec(
      `CREATE TABLE ${RehearsalMarker.TABLE} (made_at TEXT NOT NULL, from_date TEXT NOT NULL)`
    );
    conn
      .prepare(`INSERT INTO ${RehearsalMarker.TABLE} VALUES (?, ?)`)
      .run(new Date().toISOString(), from);
  }
}

/**
 * Takes the ground truth, migrates the copy by opening it the way the server does, and puts
 * every payment since `from` back as a debt.
 */
class RehearsalReset {
  constructor(private readonly args: RehearsalArguments) {}

  async run(): Promise<void> {
    const { db, folder, from } = this.args;
    if (existsSync(this.args.groundTruthFile))
      throw new Error('ground-truth.json already exists: this copy was reset once');
    const before = new Database(db, { readonly: true });
    if (RehearsalMarker.exists(before)) throw new Error('This copy is already a rehearsal copy');
    before.close();

    process.env.PACHANGUERO_DB = db;
    process.env.PACHANGUERO_BACKUPS ??= join(folder, 'backups');
    // Importing the composition root opens the copy: backup, then migration.
    const root = await import(pathToFileURL(join(SERVER_SRC, 'repo/index.js')).href);
    const { db: open } = await import(pathToFileURL(join(SERVER_SRC, 'db/index.js')).href);
    const conn = open() as Database.Database;
    console.log(
      `Migrated to schema version ${conn.pragma('user_version', { simple: true })}; backups in ${process.env.PACHANGUERO_BACKUPS}`
    );

    const truth = this.groundTruth(conn, from!);
    writeFileSync(this.args.groundTruthFile, JSON.stringify(truth, null, 2));
    console.log(`Ground truth: ${truth.payments.length} payments since ${from}`);

    conn.transaction(() => {
      for (const p of truth.payments) {
        const row = root.paymentRepository.find(p.paymentId);
        if (!row) throw new Error(`Payment ${p.paymentId} vanished`);
        root.shareSettler.unsettle(row);
      }
      RehearsalMarker.write(conn, from!);
    })();
    console.log(`Put back ${truth.payments.length} payments as debts. Marker written.`);
    conn.close();
  }

  private groundTruth(conn: Database.Database, from: string): GroundTruth {
    const payments = conn
      .prepare(
        `SELECT p.id AS paymentId, p.game_id AS gameId, g.played_on AS playedOn,
                p.beneficiary_player_id AS beneficiaryId, p.holder_player_id AS holderId,
                p.guest_ordinal AS guestOrdinal, p.payer_player_id AS payerId,
                p.amount_cents AS amountCents, p.paid_on AS paidOn, p.method AS method,
                COALESCE(b.name, 'invitado de ' || h.name) AS beneficiaryName,
                pay.name AS payerName
           FROM payments p
           JOIN games g ON g.id = p.game_id
           JOIN players h ON h.id = p.holder_player_id
           LEFT JOIN players b ON b.id = p.beneficiary_player_id
           JOIN players pay ON pay.id = p.payer_player_id
          WHERE p.paid_on >= ? ORDER BY p.id`
      )
      .all(from) as GroundPayment[];
    const named = (
      conn.prepare('SELECT id FROM players WHERE bizum_name IS NOT NULL').all() as { id: number }[]
    ).map(r => r.id);
    return { from, takenAt: new Date().toISOString(), payments, bizumNamesAtReset: named };
  }
}

/** Compares the copy now with the ground truth and writes report.md. */
class RehearsalReport {
  constructor(private readonly args: RehearsalArguments) {}

  run(): void {
    if (!existsSync(this.args.groundTruthFile))
      throw new Error('ground-truth.json not found beside the copy');
    const truth = JSON.parse(readFileSync(this.args.groundTruthFile, 'utf8')) as GroundTruth;
    const conn = new Database(this.args.db, { readonly: true });
    if (!RehearsalMarker.exists(conn))
      throw new Error('Not a rehearsal copy: no marker, refusing to report');
    const text = this.render(conn, truth);
    writeFileSync(this.args.reportFile, text);
    console.log(this.counts(conn, truth));
    conn.close();
    console.log(`Report written to ${this.args.reportFile}`);
  }

  private key(p: {
    gameId: number;
    beneficiaryId: number | null;
    holderId: number;
    guestOrdinal: number | null;
  }): string {
    return p.beneficiaryId !== null
      ? `${p.gameId}:p${p.beneficiaryId}`
      : `${p.gameId}:g${p.holderId}.${p.guestOrdinal}`;
  }

  private nowPayments(conn: Database.Database, from: string): GroundPayment[] {
    return conn
      .prepare(
        `SELECT p.id AS paymentId, p.game_id AS gameId, g.played_on AS playedOn,
                p.beneficiary_player_id AS beneficiaryId, p.holder_player_id AS holderId,
                p.guest_ordinal AS guestOrdinal, p.payer_player_id AS payerId,
                p.amount_cents AS amountCents, p.paid_on AS paidOn, p.method AS method,
                COALESCE(b.name, 'invitado de ' || h.name) AS beneficiaryName,
                pay.name AS payerName
           FROM payments p
           JOIN games g ON g.id = p.game_id
           JOIN players h ON h.id = p.holder_player_id
           LEFT JOIN players b ON b.id = p.beneficiary_player_id
           JOIN players pay ON pay.id = p.payer_player_id
          WHERE p.bizum_id IS NOT NULL AND p.paid_on >= ? ORDER BY p.id`
      )
      .all(from) as GroundPayment[];
  }

  private classify(conn: Database.Database, truth: GroundTruth) {
    const byKey = new Map(truth.payments.map(p => [this.key(p), p]));
    const automatic = this.nowPayments(conn, '0000-00-00');
    const agreed: [GroundPayment, GroundPayment][] = [];
    const disagreed: [GroundPayment, GroundPayment | null, string][] = [];
    const extra: GroundPayment[] = [];
    const settledKeys = new Set<string>();
    for (const now of automatic) {
      const was = byKey.get(this.key(now));
      settledKeys.add(this.key(now));
      if (!was) extra.push(now);
      else if (was.payerId !== now.payerId)
        disagreed.push([now, was, 'another payer']);
      else if (was.amountCents !== now.amountCents)
        disagreed.push([now, was, 'another amount']);
      else agreed.push([now, was]);
    }
    const open = truth.payments.filter(p => !settledKeys.has(this.key(p)));
    return { agreed, disagreed, extra, open };
  }

  private waiting(conn: Database.Database) {
    return conn
      .prepare(
        `SELECT b.booked_on AS bookedOn, b.amount_cents AS amountCents, b.sender_name AS sender,
                h.reason_json AS reason, h.unallocated_cents AS unallocated
           FROM bizum_handling h JOIN bizums b ON b.id = h.bizum_id
          WHERE h.status = 'waiting' ORDER BY b.booked_on, b.id`
      )
      .all() as {
      bookedOn: string;
      amountCents: number;
      sender: string | null;
      reason: string | null;
      unallocated: number;
    }[];
  }

  private reasonCode(json: string | null): string {
    return json === null ? 'kept' : (JSON.parse(json).reason?.code ?? 'kept');
  }

  private entries(conn: Database.Database): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of conn
      .prepare('SELECT outcome, COUNT(*) AS n FROM bizum_entries GROUP BY outcome')
      .all() as { outcome: string; n: number }[])
      out[r.outcome] = r.n;
    return out;
  }

  private pairings(conn: Database.Database, truth: GroundTruth): string[] {
    const before = new Set(truth.bizumNamesAtReset);
    return (
      conn
        .prepare(
          `SELECT p.id, p.name, n.bizum_name FROM player_bizum_names n
             JOIN players p ON p.id = n.player_id ORDER BY p.id, n.bizum_name`
        )
        .all() as { id: number; name: string; bizum_name: string }[]
    )
      .filter(p => !before.has(p.id))
      .map(p => `${p.name} ← «${p.bizum_name}»`);
  }

  private counts(conn: Database.Database, truth: GroundTruth): string {
    const c = this.classify(conn, truth);
    const w = this.waiting(conn);
    const byReason: Record<string, number> = {};
    for (const x of w) byReason[this.reasonCode(x.reason)] = (byReason[this.reasonCode(x.reason)] ?? 0) + 1;
    return JSON.stringify({
      groundTruth: truth.payments.length,
      agreed: c.agreed.length,
      disagreed: c.disagreed.length,
      extra: c.extra.length,
      open: c.open.length,
      waiting: byReason,
      entries: this.entries(conn),
    });
  }

  private euros(cents: number): string {
    return `${(cents / 100).toFixed(2)} €`;
  }

  private line(p: GroundPayment): string {
    return `${p.playedOn} · ${p.beneficiaryName} · ${this.euros(p.amountCents)} · paid by ${p.payerName} on ${p.paidOn}`;
  }

  private render(conn: Database.Database, truth: GroundTruth): string {
    const c = this.classify(conn, truth);
    const w = this.waiting(conn);
    const feed = conn.prepare('SELECT * FROM bizum_feed_state').get() as
      | Record<string, unknown>
      | undefined;
    const out: string[] = [
      '# Rehearsal report',
      `Ground truth: ${truth.payments.length} payments paid on or after ${truth.from}. Contains real names: never commit.`,
      '',
      '## Counts',
      '```json',
      this.counts(conn, truth),
      '```',
      `Last read: ${feed ? JSON.stringify(feed) : 'none'}`,
      '',
      `## Disagreed (${c.disagreed.length}) — each is a wrong payment`,
      ...c.disagreed.map(
        ([now, was, why]) => `- ${why}: now ${this.line(now)} | by hand ${was ? this.line(was) : '—'}`
      ),
      '',
      `## Extra (${c.extra.length}) — automatic, the organiser recorded none; each needs an explanation`,
      ...c.extra.map(p => `- ${this.line(p)}`),
      '',
      `## Agreed (${c.agreed.length})`,
      ...c.agreed.map(
        ([now, was]) => `- ${now.playedOn} · ${now.beneficiaryName} · ${this.euros(now.amountCents)} · Bizum paid on ${now.paidOn}, by hand on ${was.paidOn}`
      ),
      '',
      `## Open (${c.open.length}) — paid by hand, no Bizum settled it`,
      ...c.open.map(p => `- ${this.line(p)} (${p.method})`),
      '',
      `## Waiting Bizums (${w.length})`,
      ...w.map(
        x => `- ${x.bookedOn} · ${this.euros(x.amountCents)} · «${x.sender ?? '?'}» · ${this.reasonCode(x.reason)}${x.unallocated ? ` · ${this.euros(x.unallocated)} unassigned` : ''}`
      ),
      '',
      '## Discarded and not-a-Bizum',
      'A discarded entry keeps only its key, so only counts by outcome exist:',
      '```json',
      JSON.stringify(this.entries(conn)),
      '```',
      '',
      '## Pairings made during the rehearsal',
      ...this.pairings(conn, truth).map(p => `- ${p}`),
      '',
    ];
    return out.join('\n');
  }
}

async function main(): Promise<void> {
  const args = new RehearsalArguments(process.argv.slice(2));
  if (args.command === 'reset') await new RehearsalReset(args).run();
  else new RehearsalReport(args).run();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
