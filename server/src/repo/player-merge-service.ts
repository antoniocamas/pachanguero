import type Database from 'better-sqlite3';
import type { AliasRepository } from './alias-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { UserRepository } from './user-repository.js';

/** Every column that holds a player id, and so moves with a merge. */
const REFERENCES: readonly [table: string, column: string][] = [
  ['participations', 'player_id'],
  ['guest_candidates', 'player_id'],
  ['guest_candidates', 'host_player_id'],
  ['candidate_lines', 'name_player_id'],
  ['candidate_lines', 'host_player_id'],
  ['exclusions', 'player_id'],
  ['convocatoria_entries', 'player_id'],
  ['convocatoria_entries', 'guest_host_player_id'],
  ['share_debts', 'holder_player_id'],
  ['share_debts', 'beneficiary_player_id'],
  ['payments', 'holder_player_id'],
  ['payments', 'beneficiary_player_id'],
  ['payments', 'payer_player_id'],
];

/** Where one player's per-game rows would collide with the other's. */
const OVERLAPS = `
  SELECT DISTINCT g.played_on AS playedOn FROM games g WHERE g.id IN (
    SELECT a.game_id FROM participations a JOIN participations b
        ON a.game_id = b.game_id AND a.player_id = @from AND b.player_id = @into
    UNION SELECT a.game_id FROM exclusions a JOIN exclusions b
        ON a.game_id = b.game_id AND a.player_id = @from AND b.player_id = @into
    UNION SELECT c.game_id FROM convocatoria_entries a
        JOIN convocatoria_entries b ON a.convocatoria_id = b.convocatoria_id
        JOIN convocatorias c ON c.id = a.convocatoria_id
       WHERE a.player_id = @from AND b.player_id = @into
  ) ORDER BY g.played_on`;

/**
 * Folds one player into another when they turn out to be the same person: the
 * absorbed player's games, payments, debts and aliases become the survivor's,
 * and their name is kept as an alias so pasted lists keep matching. Refused,
 * with nothing changed, when both took part in the same game: there is no
 * telling which row is right.
 */
export class PlayerMergeService {
  constructor(
    private readonly players: PlayerRepository,
    private readonly aliases: AliasRepository,
    private readonly users: UserRepository,
    private readonly conn: Database.Database
  ) {}

  merge(intoId: number, fromId: number): void {
    if (intoId === fromId) throw new Error('Choose two different players');
    const into = this.players.nameOf(intoId);
    const from = this.players.nameOf(fromId);
    if (!into) throw new Error(`Unknown player: ${intoId}`);
    if (!from) throw new Error(`Unknown player: ${fromId}`);
    this.refuseSharedGames(intoId, fromId, into, from);
    this.refuseTwoAccounts(intoId, fromId, into, from);

    try {
      this.conn.transaction(() => {
        this.mergeSeasons(intoId, fromId);
        this.mergeIntroducers(intoId, fromId);
        for (const [table, column] of REFERENCES) {
          this.conn
            .prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`)
            .run(intoId, fromId);
        }
        for (const { alias } of this.aliases
          .listAll()
          .filter(a => a.playerId === fromId)) {
          this.aliases.add(intoId, alias);
        }
        this.aliases.add(intoId, from);
        this.mergeContacts(intoId, fromId);
        this.mergeBizumNames(intoId, fromId);
        // The account follows the person, before the absorbed player row goes.
        this.users.movePlayer(fromId, intoId);
        // Cascades whatever was left (the absorbed player's own seasons rows).
        this.conn.prepare('DELETE FROM players WHERE id = ?').run(fromId);
      })();
    } catch (e) {
      if ((e as { code?: string }).code?.startsWith('SQLITE_CONSTRAINT')) {
        throw new Error(
          `No se puede fundir ${from} con ${into}: aparecen los dos en el mismo partido o pago`,
          { cause: e }
        );
      }
      throw e;
    }
  }

  private refuseSharedGames(
    intoId: number,
    fromId: number,
    into: string,
    from: string
  ): void {
    const shared = this.conn
      .prepare(OVERLAPS)
      .all({ from: fromId, into: intoId }) as { playedOn: string }[];
    if (shared.length) {
      throw new Error(
        `No se puede fundir ${from} con ${into}: aparecen los dos en ${shared
          .map(g => g.playedOn)
          .join(', ')}`
      );
    }
  }

  private refuseTwoAccounts(
    intoId: number,
    fromId: number,
    into: string,
    from: string
  ): void {
    const a = this.users.byPlayer(intoId);
    const b = this.users.byPlayer(fromId);
    if (a && b) {
      throw new Error(
        `No se puede fundir ${from} con ${into}: los dos tienen usuario (${a.username}, ${b.username})`
      );
    }
  }

  /** In a season both are in, the larger seniority stands. */
  private mergeSeasons(intoId: number, fromId: number): void {
    this.conn
      .prepare(
        `INSERT INTO season_players (season_id, player_id, seasons)
         SELECT season_id, @into, seasons FROM season_players WHERE player_id = @from
         ON CONFLICT (season_id, player_id)
         DO UPDATE SET seasons = MAX(season_players.seasons, excluded.seasons)`
      )
      .run({ into: intoId, from: fromId });
  }

  /**
   * The survivor's own phone wins, the absorbed player's fills the gap; the survivor keeps their
   * emails and takes the absorbed player's too. So do their usual hosts and their roles in the
   * seasons the survivor has none for.
   */
  private mergeContacts(intoId: number, fromId: number): void {
    const ids = { into: intoId, from: fromId };
    this.conn
      .prepare(
        `INSERT INTO player_contacts (player_id, phone)
         SELECT @into, phone FROM player_contacts WHERE player_id = @from
         ON CONFLICT (player_id) DO UPDATE SET
           phone = COALESCE(player_contacts.phone, excluded.phone)`
      )
      .run(ids);
    this.conn
      .prepare(
        `INSERT OR IGNORE INTO player_emails (player_id, email)
           SELECT @into, email FROM player_emails WHERE player_id = @from ORDER BY rowid`
      )
      .run(ids);
    this.conn
      .prepare(
        `INSERT OR IGNORE INTO season_roles (season_id, player_id, role)
           SELECT season_id, @into, role FROM season_roles WHERE player_id = @from`
      )
      .run(ids);
    this.conn
      .prepare(
        `INSERT OR IGNORE INTO player_hosts (player_id, host_player_id, position)
           SELECT @into, host_player_id,
                  (SELECT COALESCE(MAX(position), 0) FROM player_hosts WHERE player_id = @into) + position
             FROM player_hosts WHERE player_id = @from AND host_player_id <> @into
            ORDER BY position`
      )
      .run(ids);
    // Whoever had the absorbed player as host now has the survivor.
    this.conn
      .prepare(
        `UPDATE OR IGNORE player_hosts SET host_player_id = @into
          WHERE host_player_id = @from AND player_id <> @into`
      )
      .run(ids);
  }

  /** The survivor keeps their Bizum names and takes the absorbed player's too. */
  private mergeBizumNames(intoId: number, fromId: number): void {
    this.conn
      .prepare(
        `INSERT OR IGNORE INTO player_bizum_names (player_id, bizum_name)
           SELECT @into, bizum_name FROM player_bizum_names WHERE player_id = @from
            ORDER BY rowid`
      )
      .run({ into: intoId, from: fromId });
  }

  /** Who introduced them follows the person, never pointing at themselves. */
  private mergeIntroducers(intoId: number, fromId: number): void {
    this.conn
      .prepare(
        `UPDATE players SET introduced_by = (
           SELECT introduced_by FROM players WHERE id = @from)
          WHERE id = @into AND introduced_by IS NULL`
      )
      .run({ into: intoId, from: fromId });
    this.conn
      .prepare(
        'UPDATE players SET introduced_by = @into WHERE introduced_by = @from'
      )
      .run({ into: intoId, from: fromId });
    this.conn
      .prepare(
        'UPDATE players SET introduced_by = NULL WHERE id = @into AND introduced_by = @into'
      )
      .run({ into: intoId });
  }
}
