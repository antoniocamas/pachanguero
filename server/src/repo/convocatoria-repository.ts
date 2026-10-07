import type Database from 'better-sqlite3';
import type { MemberKey, Outcome } from '../domain/types.js';

export interface NewEntry {
  key: MemberKey;
  position: number;
  points: number;
  waitCounter: number;
  outcome: Outcome;
  playing: boolean;
}

export interface StoredEntry {
  id: number;
  convocatoria_id: number;
  player_id: number | null;
  guest_host_player_id: number | null;
  guest_ordinal: number | null;
  /** The player's name, or "Invitado de <host>" for an anonymous plus-one. */
  name: string;
  position: number;
  points: number;
  wait_counter: number;
  outcome: Outcome;
  playing: number;
  /** True when `playing` differs from what the selection chose. */
  changed_by_hand: boolean;
}

export interface StoredConvocatoria {
  id: number;
  game_id: number;
  rules_json: string;
  created_at: string;
  confirmed_at: string | null;
  source: 'generated' | 'history';
  entries: StoredEntry[];
}

type EntryRow = Omit<StoredEntry, 'changed_by_hand'>;

/** Persistence of the stored convocatoria: its head row and its entries. */
export class ConvocatoriaRepository {
  constructor(private readonly conn: Database.Database) {}

  find(gameId: number): StoredConvocatoria | null {
    const head = this.conn
      .prepare('SELECT * FROM convocatorias WHERE game_id = ?')
      .get(gameId) as Omit<StoredConvocatoria, 'entries'> | undefined;
    if (!head) return null;
    const entries = this.conn
      .prepare(
        `SELECT ce.*,
                COALESCE(p.name, 'Invitado de ' || h.name) AS name
           FROM convocatoria_entries ce
           LEFT JOIN players p ON p.id = ce.player_id
           LEFT JOIN players h ON h.id = ce.guest_host_player_id
          WHERE ce.convocatoria_id = ? ORDER BY ce.position`
      )
      .all(head.id) as EntryRow[];
    return {
      ...head,
      entries: entries.map(e => ({
        ...e,
        changed_by_hand: this.changedByHand(e),
      })),
    };
  }

  /** Drop any earlier convocatoria of the game and store this one in its place. */
  replace(
    gameId: number,
    rulesJson: string,
    entries: NewEntry[],
    source: 'generated' | 'history' = 'generated'
  ): void {
    this.conn.transaction(() => {
      this.conn
        .prepare('DELETE FROM convocatorias WHERE game_id = ?')
        .run(gameId);
      const info = this.conn
        .prepare(
          'INSERT INTO convocatorias (game_id, rules_json, source) VALUES (?, ?, ?)'
        )
        .run(gameId, rulesJson, source);
      const cid = Number(info.lastInsertRowid);
      for (const e of entries) this.insert(cid, e);
    })();
  }

  /** Stamp the stored convocatoria as confirmed; nothing else in it changes. */
  confirm(gameId: number): void {
    this.conn
      .prepare(
        `UPDATE convocatorias SET confirmed_at = datetime('now') WHERE game_id = ?`
      )
      .run(gameId);
  }

  /** The entry for a member of a game's convocatoria, if it has one. */
  entryOf(gameId: number, key: MemberKey): StoredEntry | null {
    return (
      this.find(gameId)?.entries.find(e => this.sameMember(e, key)) ?? null
    );
  }

  setPlaying(entryId: number, playing: boolean): void {
    this.conn
      .prepare('UPDATE convocatoria_entries SET playing = ? WHERE id = ?')
      .run(playing ? 1 : 0, entryId);
  }

  addEntry(gameId: number, entry: NewEntry): void {
    const head = this.conn
      .prepare('SELECT id FROM convocatorias WHERE game_id = ?')
      .get(gameId) as { id: number };
    this.insert(head.id, entry);
  }

  removeEntry(entryId: number): void {
    this.conn
      .prepare('DELETE FROM convocatoria_entries WHERE id = ?')
      .run(entryId);
  }

  playingCount(gameId: number): number {
    return (
      this.conn
        .prepare(
          `SELECT COUNT(*) AS n FROM convocatoria_entries ce
             JOIN convocatorias c ON c.id = ce.convocatoria_id
            WHERE c.game_id = ? AND ce.playing = 1`
        )
        .get(gameId) as { n: number }
    ).n;
  }

  private insert(convocatoriaId: number, e: NewEntry): void {
    const player = 'playerId' in e.key ? e.key.playerId : null;
    const host = 'hostPlayerId' in e.key ? e.key.hostPlayerId : null;
    const ordinal = 'ordinal' in e.key ? e.key.ordinal : null;
    this.conn
      .prepare(
        `INSERT INTO convocatoria_entries
           (convocatoria_id, player_id, guest_host_player_id, guest_ordinal,
            position, points, wait_counter, outcome, playing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        convocatoriaId,
        player,
        host,
        ordinal,
        e.position,
        e.points,
        e.waitCounter,
        e.outcome,
        e.playing ? 1 : 0
      );
  }

  /** The one rule for "changed by hand", shared by every reader. */
  private changedByHand(e: EntryRow): boolean {
    const chosen = e.outcome === 'called_up' || e.outcome === 'mercy';
    return (e.playing === 1) !== chosen;
  }

  private sameMember(e: EntryRow, key: MemberKey): boolean {
    return 'playerId' in key
      ? e.player_id === key.playerId
      : e.guest_host_player_id === key.hostPlayerId &&
          e.guest_ordinal === key.ordinal;
  }
}
