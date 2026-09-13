import type Database from 'better-sqlite3';
import type { SeasonRules } from '../domain/types.js';

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

export interface NewSeasonInput {
  name: string;
  starts_on?: string;
  ends_on?: string;
  price_cents?: number;
  slots?: number;
  mercy_seats?: number;
  games_out_for_mercy?: number;
  mercy_resets_counter?: boolean;
  demotion_direction?: 'bottom-up' | 'top-down';
}

const UPDATABLE_COLUMNS = [
  'name',
  'starts_on',
  'ends_on',
  'price_cents',
  'slots',
  'mercy_seats',
  'games_out_for_mercy',
  'mercy_resets_counter',
  'demotion_direction',
] as const;

export class SeasonRepository {
  constructor(private readonly conn: Database.Database) {}

  list(): SeasonRow[] {
    return this.conn
      .prepare('SELECT * FROM seasons ORDER BY name DESC')
      .all() as SeasonRow[];
  }

  get(id: number): SeasonRow | undefined {
    return this.conn.prepare('SELECT * FROM seasons WHERE id = ?').get(id) as
      SeasonRow | undefined;
  }

  active(): SeasonRow | undefined {
    return this.conn
      .prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC')
      .get() as SeasonRow | undefined;
  }

  create(input: NewSeasonInput): SeasonRow {
    const info = this.conn
      .prepare(
        `INSERT INTO seasons (name, starts_on, ends_on, price_cents, slots, mercy_seats,
                              games_out_for_mercy, mercy_resets_counter, demotion_direction)
         VALUES (@name, @starts_on, @ends_on, @price_cents, @slots, @mercy_seats,
                 @games_out_for_mercy, @mercy_resets_counter, @demotion_direction)`
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
    return this.get(Number(info.lastInsertRowid))!;
  }

  update(id: number, patch: Record<string, unknown>): SeasonRow | undefined {
    const keys = Object.keys(patch).filter(k =>
      (UPDATABLE_COLUMNS as readonly string[]).includes(k)
    );
    if (keys.length) {
      const set = keys.map(k => `${k} = @${k}`).join(', ');
      const values: Record<string, unknown> = { id };
      for (const k of keys) {
        values[k] =
          k === 'mercy_resets_counter' ? (patch[k] ? 1 : 0) : patch[k];
      }
      this.conn.prepare(`UPDATE seasons SET ${set} WHERE id = @id`).run(values);
    }
    return this.get(id);
  }

  activate(id: number): void {
    this.conn.transaction(() => {
      this.conn.prepare('UPDATE seasons SET is_active = 0').run();
      this.conn
        .prepare('UPDATE seasons SET is_active = 1 WHERE id = ?')
        .run(id);
    })();
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
