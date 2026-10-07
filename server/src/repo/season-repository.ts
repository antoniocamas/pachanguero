import type Database from 'better-sqlite3';
import type { SeasonRules } from '../domain/types.js';
import { SeasonCalendar } from '../domain/season-calendar.js';

export interface SeasonRow {
  id: number;
  name: string;
  starts_on: string;
  ends_on: string;
  price_cents: number;
  slots: number;
  mercy_seats: number;
  games_out_for_mercy: number;
  mercy_resets_counter: number;
  demotion_direction: 'bottom-up' | 'top-down';
}

export interface NewSeasonInput {
  name: string;
  price_cents?: number;
  slots?: number;
  mercy_seats?: number;
  games_out_for_mercy?: number;
  mercy_resets_counter?: boolean;
  demotion_direction?: 'bottom-up' | 'top-down';
}

const UPDATABLE_COLUMNS = [
  'name',
  'price_cents',
  'slots',
  'mercy_seats',
  'games_out_for_mercy',
  'mercy_resets_counter',
  'demotion_direction',
] as const;

export class SeasonRepository {
  private readonly calendar = new SeasonCalendar();

  constructor(private readonly conn: Database.Database) {}

  /** The season whose Sept-Aug range contains `asOf` (default today), if any. */
  current(
    asOf: string = new Date().toISOString().slice(0, 10)
  ): SeasonRow | undefined {
    return this.conn
      .prepare(
        `SELECT * FROM seasons WHERE starts_on <= @on AND ends_on >= @on
          ORDER BY starts_on DESC LIMIT 1`
      )
      .get({ on: asOf }) as SeasonRow | undefined;
  }

  /** The name of the season `asOf` falls in, when it has not been created yet. */
  missing(asOf: string): string | null {
    return this.current(asOf) ? null : this.calendar.nameFor(asOf);
  }

  /** Bounds follow from the name's leading year ('2024/2025' starts in 2024). */
  private boundsFromName(name: string): { startsOn: string; endsOn: string } {
    const prefix = name.slice(0, 4);
    if (!/^\d{4}$/.test(prefix)) {
      throw new Error(`Season name must start with a 4-digit year: ${name}`);
    }
    return this.calendar.boundsFor(Number(prefix));
  }

  list(): SeasonRow[] {
    return this.conn
      .prepare('SELECT * FROM seasons ORDER BY name DESC')
      .all() as SeasonRow[];
  }

  get(id: number): SeasonRow | undefined {
    return this.conn.prepare('SELECT * FROM seasons WHERE id = ?').get(id) as
      SeasonRow | undefined;
  }

  create(input: NewSeasonInput): SeasonRow {
    const { startsOn, endsOn } = this.boundsFromName(input.name);
    const info = this.conn
      .prepare(
        `INSERT INTO seasons (name, starts_on, ends_on, price_cents, slots, mercy_seats,
                              games_out_for_mercy, mercy_resets_counter, demotion_direction)
         VALUES (@name, @starts_on, @ends_on, @price_cents, @slots, @mercy_seats,
                 @games_out_for_mercy, @mercy_resets_counter, @demotion_direction)`
      )
      .run({
        name: input.name,
        starts_on: startsOn,
        ends_on: endsOn,
        price_cents: input.price_cents ?? 5600,
        slots: input.slots ?? 14,
        mercy_seats: input.mercy_seats ?? 1,
        games_out_for_mercy: input.games_out_for_mercy ?? 2,
        mercy_resets_counter: input.mercy_resets_counter ? 1 : 0,
        demotion_direction: input.demotion_direction ?? 'bottom-up',
      });
    return this.get(Number(info.lastInsertRowid))!;
  }

  update(id: number, patch: Record<string, unknown>): SeasonRow | undefined {
    const keys = Object.keys(patch).filter(k =>
      (UPDATABLE_COLUMNS as readonly string[]).includes(k)
    );
    if (keys.length) {
      const values: Record<string, unknown> = { id };
      for (const k of keys) {
        values[k] =
          k === 'mercy_resets_counter' ? (patch[k] ? 1 : 0) : patch[k];
      }
      const columns: string[] = [...keys];
      if (typeof patch.name === 'string') {
        const { startsOn, endsOn } = this.boundsFromName(patch.name);
        values.starts_on = startsOn;
        values.ends_on = endsOn;
        columns.push('starts_on', 'ends_on');
      }
      const set = columns.map(k => `${k} = @${k}`).join(', ');
      this.conn.prepare(`UPDATE seasons SET ${set} WHERE id = @id`).run(values);
    }
    return this.get(id);
  }

  /** The standard share of one player for a game of the season, in integer cents. */
  shareCents(seasonId: number): number {
    const season = this.get(seasonId)!;
    return Math.round(season.price_cents / season.slots);
  }

  rulesOf(season: SeasonRow): SeasonRules {
    return {
      slots: season.slots,
      mercySeats: season.mercy_seats,
      gamesOutForMercy: season.games_out_for_mercy,
      mercyResetsCounter: !!season.mercy_resets_counter,
      demotionDirection: season.demotion_direction,
    };
  }
}
