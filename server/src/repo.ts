import { db, tx } from './db/index.js';
import { buildConvocatoria, type History } from './domain/convocatoria.js';
import { computePoints } from './domain/points.js';
import type {
  ConvocatoriaResult,
  Contender,
  ExclusionKind,
  SeasonRules,
} from './domain/types.js';

export interface SeasonRow {
  id: number;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: number;
  price_cents: number;
  slots: number;
  mercy_seats: number;
  games_out_for_mercy: number;
  mercy_resets_counter: number;
  demotion_direction: 'bottom-up' | 'top-down';
}

export function rulesOf(s: SeasonRow): SeasonRules {
  return {
    slots: s.slots,
    mercySeats: s.mercy_seats,
    gamesOutForMercy: s.games_out_for_mercy,
    mercyResetsCounter: !!s.mercy_resets_counter,
    demotionDirection: s.demotion_direction,
  };
}

/* ------------------------------------------------------------------ seasons */

export const listSeasons = (): SeasonRow[] =>
  db().prepare('SELECT * FROM seasons ORDER BY name DESC').all() as SeasonRow[];

export const getSeason = (id: number): SeasonRow | undefined =>
  db().prepare('SELECT * FROM seasons WHERE id = ?').get(id) as SeasonRow | undefined;

export const activeSeason = (): SeasonRow | undefined =>
  db().prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC').get() as
    | SeasonRow
    | undefined;

export function createSeason(input: {
  name: string;
  starts_on?: string;
  ends_on?: string;
  price_cents?: number;
  slots?: number;
  mercy_seats?: number;
  games_out_for_mercy?: number;
  mercy_resets_counter?: boolean;
  demotion_direction?: 'bottom-up' | 'top-down';
}): SeasonRow {
  const info = db()
    .prepare(
      `INSERT INTO seasons (name, starts_on, ends_on, price_cents, slots, mercy_seats,
                            games_out_for_mercy, mercy_resets_counter, demotion_direction)
       VALUES (@name, @starts_on, @ends_on, @price_cents, @slots, @mercy_seats,
               @games_out_for_mercy, @mercy_resets_counter, @demotion_direction)`,
    )
    .run({
      name: input.name,
      starts_on: input.starts_on ?? null,
      ends_on: input.ends_on ?? null,
      price_cents: input.price_cents ?? 5600,
      slots: input.slots ?? 14,
      mercy_seats: input.mercy_seats ?? 1,
      games_out_for_mercy: input.games_out_for_mercy ?? 2,
      mercy_resets_counter: input.mercy_resets_counter ? 1 : 0,
      demotion_direction: input.demotion_direction ?? 'bottom-up',
    });
  return getSeason(Number(info.lastInsertRowid))!;
}

export function updateSeason(id: number, patch: Record<string, unknown>): SeasonRow | undefined {
  const allowed = [
    'name', 'starts_on', 'ends_on', 'price_cents', 'slots', 'mercy_seats',
    'games_out_for_mercy', 'mercy_resets_counter', 'demotion_direction',
  ];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (keys.length) {
    const set = keys.map((k) => `${k} = @${k}`).join(', ');
    const values: Record<string, unknown> = { id };
    for (const k of keys) {
      values[k] = k === 'mercy_resets_counter' ? (patch[k] ? 1 : 0) : patch[k];
    }
    db().prepare(`UPDATE seasons SET ${set} WHERE id = @id`).run(values);
  }
  return getSeason(id);
}

export function activateSeason(id: number): void {
  tx(() => {
    db().prepare('UPDATE seasons SET is_active = 0').run();
    db().prepare('UPDATE seasons SET is_active = 1 WHERE id = ?').run(id);
  });
}

/* ------------------------------------------------------------------ players */

export interface PlayerRow {
  id: number;
  name: string;
  seasons: number;
  active: number;
}

export const listPlayers = (seasonId: number): PlayerRow[] =>
  db()
    .prepare(
      `SELECT p.id, p.name, sp.seasons, sp.active
         FROM season_players sp JOIN players p ON p.id = sp.player_id
        WHERE sp.season_id = ?
        ORDER BY p.name COLLATE NOCASE`,
    )
    .all(seasonId) as PlayerRow[];

/** Create the player if new, then enrol them in the season. Idempotent. */
export function addPlayer(seasonId: number, name: string, seasons = 1): PlayerRow {
  return tx(() => {
    db().prepare('INSERT OR IGNORE INTO players (name) VALUES (?)').run(name.trim());
    const { id } = db().prepare('SELECT id FROM players WHERE name = ?').get(name.trim()) as {
      id: number;
    };
    db()
      .prepare(
        `INSERT INTO season_players (season_id, player_id, seasons) VALUES (?, ?, ?)
         ON CONFLICT (season_id, player_id) DO UPDATE SET seasons = excluded.seasons, active = 1`,
      )
      .run(seasonId, id, seasons);
    return db()
      .prepare(
        `SELECT p.id, p.name, sp.seasons, sp.active
           FROM season_players sp JOIN players p ON p.id = sp.player_id
          WHERE sp.season_id = ? AND p.id = ?`,
      )
      .get(seasonId, id) as PlayerRow;
  });
}

export function updateSeasonPlayer(
  seasonId: number,
  playerId: number,
  patch: { seasons?: number; active?: boolean },
): void {
  if (patch.seasons !== undefined) {
    db()
      .prepare('UPDATE season_players SET seasons = ? WHERE season_id = ? AND player_id = ?')
      .run(patch.seasons, seasonId, playerId);
  }
  if (patch.active !== undefined) {
    db()
      .prepare('UPDATE season_players SET active = ? WHERE season_id = ? AND player_id = ?')
      .run(patch.active ? 1 : 0, seasonId, playerId);
  }
}

/* -------------------------------------------------------------------- games */

export interface GameRow {
  id: number;
  season_id: number;
  played_on: string;
  label: string | null;
  status: 'scheduled' | 'played' | 'cancelled';
  notes: string | null;
}

export const listGames = (seasonId: number): GameRow[] =>
  db()
    .prepare('SELECT * FROM games WHERE season_id = ? ORDER BY played_on, id')
    .all(seasonId) as GameRow[];

export const getGame = (id: number): GameRow | undefined =>
  db().prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined;

export function createGame(
  seasonId: number,
  played_on: string,
  label?: string | null,
  status: GameRow['status'] = 'scheduled',
): GameRow {
  const info = db()
    .prepare('INSERT INTO games (season_id, played_on, label, status) VALUES (?, ?, ?, ?)')
    .run(seasonId, played_on, label ?? null, status);
  return getGame(Number(info.lastInsertRowid))!;
}

export function updateGame(id: number, patch: Partial<GameRow>): GameRow | undefined {
  const allowed = ['played_on', 'label', 'status', 'notes'] as const;
  const keys = allowed.filter((k) => patch[k] !== undefined);
  if (keys.length) {
    const set = keys.map((k) => `${k} = @${k}`).join(', ');
    db()
      .prepare(`UPDATE games SET ${set} WHERE id = @id`)
      .run({ id, ...Object.fromEntries(keys.map((k) => [k, patch[k]])) });
  }
  return getGame(id);
}

export const deleteGame = (id: number): void => {
  db().prepare('DELETE FROM games WHERE id = ?').run(id);
};

/* ----------------------------------------------------------- participations */

export interface ParticipationRow {
  game_id: number;
  player_id: number;
  name: string;
  signed_up: number;
  played: number;
  paid_cents: number;
  paid_on: string | null;
  guests: number;
  note: string | null;
}

export const listParticipations = (gameId: number): ParticipationRow[] =>
  db()
    .prepare(
      `SELECT pa.*, p.name FROM participations pa JOIN players p ON p.id = pa.player_id
        WHERE pa.game_id = ? ORDER BY p.name COLLATE NOCASE`,
    )
    .all(gameId) as ParticipationRow[];

/**
 * Set a player's state for a game. Signup, attendance and payment are separate
 * fields on purpose — the legacy sheet crammed all three into one `*`/`4` cell
 * and lost the fact that a payment ever arrived late.
 */
export function setParticipation(
  gameId: number,
  playerId: number,
  patch: {
    signed_up?: boolean;
    played?: boolean;
    paid_cents?: number;
    paid_on?: string | null;
    guests?: number;
    note?: string | null;
  },
): void {
  db()
    .prepare(
      `INSERT INTO participations (game_id, player_id) VALUES (?, ?)
       ON CONFLICT (game_id, player_id) DO NOTHING`,
    )
    .run(gameId, playerId);

  const sets: string[] = [];
  const values: Record<string, unknown> = { gameId, playerId };
  const put = (col: string, v: unknown) => {
    sets.push(`${col} = @${col}`);
    values[col] = v;
  };

  if (patch.signed_up !== undefined) put('signed_up', patch.signed_up ? 1 : 0);
  if (patch.played !== undefined) put('played', patch.played ? 1 : 0);
  if (patch.guests !== undefined) put('guests', patch.guests);
  if (patch.note !== undefined) put('note', patch.note);
  if (patch.paid_cents !== undefined) {
    put('paid_cents', patch.paid_cents);
    // Stamp the settlement date when money first appears, clear it when reversed.
    if (patch.paid_on !== undefined) put('paid_on', patch.paid_on);
    else put('paid_on', patch.paid_cents > 0 ? new Date().toISOString().slice(0, 10) : null);
  } else if (patch.paid_on !== undefined) {
    put('paid_on', patch.paid_on);
  }

  if (!sets.length) return;
  db()
    .prepare(
      `UPDATE participations SET ${sets.join(', ')} WHERE game_id = @gameId AND player_id = @playerId`,
    )
    .run(values);
}

export function removeParticipation(gameId: number, playerId: number): void {
  db()
    .prepare('DELETE FROM participations WHERE game_id = ? AND player_id = ?')
    .run(gameId, playerId);
}

/* --------------------------------------------------------------- exclusions */

export function setExclusion(gameId: number, playerId: number, kind: ExclusionKind | null): void {
  if (kind === null) {
    db().prepare('DELETE FROM exclusions WHERE game_id = ? AND player_id = ?').run(gameId, playerId);
    return;
  }
  db()
    .prepare(
      `INSERT INTO exclusions (game_id, player_id, kind) VALUES (?, ?, ?)
       ON CONFLICT (game_id, player_id) DO UPDATE SET kind = excluded.kind`,
    )
    .run(gameId, playerId, kind);
}

/** Season exclusion history per player, in game order. */
export function historyFor(seasonId: number, upToGameId?: number): History {
  const rows = db()
    .prepare(
      `SELECT e.player_id, e.kind
         FROM exclusions e JOIN games g ON g.id = e.game_id
        WHERE g.season_id = @seasonId
          AND (@upTo IS NULL OR g.played_on < (SELECT played_on FROM games WHERE id = @upTo)
               OR (g.played_on = (SELECT played_on FROM games WHERE id = @upTo) AND g.id < @upTo))
        ORDER BY g.played_on, g.id`,
    )
    .all({ seasonId, upTo: upToGameId ?? null }) as Array<{
    player_id: number;
    kind: ExclusionKind;
  }>;

  const map: History = new Map();
  for (const r of rows) {
    const list = map.get(r.player_id) ?? [];
    list.push(r.kind);
    map.set(r.player_id, list);
  }
  return map;
}

/* ------------------------------------------------------------------ scoring */

export interface Standing {
  playerId: number;
  name: string;
  seasons: number;
  paidGames: number;
  exclusions: number;
  attendance: number;
  seniority: number;
  points: number;
  gamesPlayed: number;
  debtCents: number;
}

/**
 * Standings for a season. `upToGameId` excludes that game and everything after
 * it, which is what selection for that game must see.
 */
export function standings(seasonId: number, upToGameId?: number): Standing[] {
  const players = listPlayers(seasonId);
  const bound = upToGameId
    ? (db().prepare('SELECT played_on FROM games WHERE id = ?').get(upToGameId) as
        | { played_on: string }
        | undefined)
    : undefined;

  const cutoff = bound
    ? { played_on: bound.played_on, id: upToGameId! }
    : { played_on: '9999-12-31', id: Number.MAX_SAFE_INTEGER };

  const paid = db()
    .prepare(
      `SELECT pa.player_id,
              SUM(CASE WHEN pa.paid_cents > 0 THEN 1 ELSE 0 END) AS paid_games,
              SUM(CASE WHEN pa.played = 1 THEN 1 ELSE 0 END)     AS games_played
         FROM participations pa JOIN games g ON g.id = pa.game_id
        WHERE g.season_id = @seasonId AND g.status != 'cancelled'
          AND (g.played_on < @on OR (g.played_on = @on AND g.id < @id))
        GROUP BY pa.player_id`,
    )
    .all({ seasonId, on: cutoff.played_on, id: cutoff.id }) as Array<{
    player_id: number;
    paid_games: number;
    games_played: number;
  }>;

  // Debt is always current — it is money owed, not a point-in-time score.
  const debt = db()
    .prepare(
      `SELECT pa.player_id,
              SUM(CASE WHEN pa.played = 1 AND pa.paid_cents = 0 THEN @price ELSE 0 END) AS debt
         FROM participations pa JOIN games g ON g.id = pa.game_id
        WHERE g.season_id = @seasonId AND g.status != 'cancelled'
        GROUP BY pa.player_id`,
    )
    .all({
      seasonId,
      price: Math.round((getSeason(seasonId)?.price_cents ?? 5600) / (getSeason(seasonId)?.slots ?? 14)),
    }) as Array<{ player_id: number; debt: number }>;

  const history = historyFor(seasonId, upToGameId);
  const paidBy = new Map(paid.map((r) => [r.player_id, r]));
  const debtBy = new Map(debt.map((r) => [r.player_id, r.debt]));

  return players
    .map((p) => {
      const stats = paidBy.get(p.id);
      const excl = (history.get(p.id) ?? []).filter((k) => k !== 'mercy').length;
      const b = computePoints({
        paidGames: stats?.paid_games ?? 0,
        exclusions: excl,
        seasons: p.seasons,
      });
      return {
        playerId: p.id,
        name: p.name,
        seasons: p.seasons,
        paidGames: stats?.paid_games ?? 0,
        exclusions: excl,
        attendance: b.attendance,
        seniority: b.seniority,
        points: b.total,
        gamesPlayed: stats?.games_played ?? 0,
        debtCents: debtBy.get(p.id) ?? 0,
      };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es'));
}

/* ------------------------------------------------------------- convocatoria */

/** Run selection for a game without persisting it. */
export function previewConvocatoria(gameId: number): ConvocatoriaResult & { game: GameRow } {
  const game = getGame(gameId);
  if (!game) throw new Error(`No game ${gameId}`);
  const season = getSeason(game.season_id)!;

  const signedUp = db()
    .prepare(
      `SELECT pa.player_id FROM participations pa
        WHERE pa.game_id = ? AND pa.signed_up = 1`,
    )
    .all(gameId) as Array<{ player_id: number }>;
  const signedIds = new Set(signedUp.map((r) => r.player_id));

  const table = standings(game.season_id, gameId);
  const contenders: Contender[] = table
    .filter((s) => signedIds.has(s.playerId))
    .map((s) => ({ playerId: s.playerId, name: s.name, points: s.points }));

  const result = buildConvocatoria(contenders, historyFor(game.season_id, gameId), rulesOf(season));
  return { ...result, game };
}

/** Run selection and write the outcome: frozen entries plus exclusion marks. */
export function commitConvocatoria(gameId: number): ConvocatoriaResult & { game: GameRow } {
  const preview = previewConvocatoria(gameId);
  const game = preview.game;
  const season = getSeason(game.season_id)!;

  tx(() => {
    db().prepare('DELETE FROM convocatorias WHERE game_id = ?').run(gameId);
    const info = db()
      .prepare('INSERT INTO convocatorias (game_id, rules_json) VALUES (?, ?)')
      .run(gameId, JSON.stringify(rulesOf(season)));
    const cid = Number(info.lastInsertRowid);

    const insert = db().prepare(
      `INSERT INTO convocatoria_entries
         (convocatoria_id, player_id, position, points, wait_counter, outcome, playing)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    db().prepare('DELETE FROM exclusions WHERE game_id = ?').run(gameId);

    for (const e of preview.entries) {
      insert.run(cid, e.playerId, e.position, e.points, e.waitCounter, e.outcome, e.playing ? 1 : 0);
      if (e.outcome === 'mercy') setExclusion(gameId, e.playerId, 'mercy');
      else if (e.outcome === 'demoted') setExclusion(gameId, e.playerId, 'demoted');
      else if (e.outcome === 'excluded') setExclusion(gameId, e.playerId, 'points');
      // Only those who play are marked as playing; payment is recorded later.
      setParticipation(gameId, e.playerId, { played: e.playing });
    }
  });

  return preview;
}

export function savedConvocatoria(gameId: number) {
  const head = db().prepare('SELECT * FROM convocatorias WHERE game_id = ?').get(gameId) as
    | { id: number; rules_json: string; created_at: string }
    | undefined;
  if (!head) return null;
  const entries = db()
    .prepare(
      `SELECT ce.*, p.name FROM convocatoria_entries ce JOIN players p ON p.id = ce.player_id
        WHERE ce.convocatoria_id = ? ORDER BY ce.position`,
    )
    .all(head.id);
  return { ...head, rules: JSON.parse(head.rules_json), entries };
}
