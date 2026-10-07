import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { GameLifecycle } from '../domain/game-lifecycle.js';
import { TestDatabase } from '../db/test-support.js';
import { DebtRepository } from './debt-repository.js';
import { GameRepository, type GameRow } from './game-repository.js';
import {
  GameLifecycleService,
  type PlayedEffect,
} from './game-lifecycle-service.js';
import { SeasonRepository } from './season-repository.js';

class RecordingEffect implements PlayedEffect {
  readonly calls: string[] = [];
  apply(game: GameRow) {
    this.calls.push(`apply ${game.id}`);
  }
  retract(game: GameRow) {
    this.calls.push(`retract ${game.id}`);
  }
}

class ThrowingEffect implements PlayedEffect {
  apply() {
    throw new Error('effect failed');
  }
  retract() {
    throw new Error('effect failed');
  }
}

describe('GameLifecycleService', () => {
  let conn: Database.Database;
  let games: GameRepository;
  let seasonId: number;
  let day = 1;

  const service = (...effects: PlayedEffect[]) =>
    new GameLifecycleService(
      games,
      new GameLifecycle(),
      new DebtRepository(conn),
      effects,
      conn
    );
  const game = (
    status: GameRow['status'],
    from: GameRow['cancelled_from'] = null
  ) =>
    games.create(
      seasonId,
      `2025-10-${String(day++).padStart(2, '0')}`,
      null,
      status,
      from
    ).id;

  beforeEach(() => {
    conn = TestDatabase.create();
    games = new GameRepository(conn);
    seasonId = new SeasonRepository(conn).create({ name: '2025/2026' }).id;
    day = 1;
  });

  it('play is refused from open and leaves the state', () => {
    const id = game('open');
    expect(() => service().perform(id, 'play')).toThrow(
      'Confirma la convocatoria antes de marcar el partido como jugado'
    );
    expect(games.get(id)?.status).toBe('open');
  });

  it('reopen returns a played game to confirmed', () => {
    const id = game('played');
    expect(service().perform(id, 'reopen')).toBe('convocatoria_confirmed');
    expect(games.get(id)?.status).toBe('convocatoria_confirmed');
  });

  it.each([
    'open',
    'convocatoria_created',
    'convocatoria_confirmed',
    'played',
  ] as const)(
    'cancel from %s stores where it left and uncancel restores it',
    from => {
      const id = game(from);
      const s = service();
      s.perform(id, 'cancel');
      expect(games.get(id)).toMatchObject({
        status: 'cancelled',
        cancelled_from: from,
      });
      s.perform(id, 'uncancel');
      expect(games.get(id)).toMatchObject({
        status: from,
        cancelled_from: null,
      });
    }
  );

  it('effects apply on play and on uncancel back to played', () => {
    const effect = new RecordingEffect();
    const s = service(effect);
    const playing = game('convocatoria_confirmed');
    s.perform(playing, 'play');
    const restored = game('played');
    s.perform(restored, 'cancel');
    effect.calls.length = 0;
    s.perform(restored, 'uncancel');
    expect(effect.calls).toEqual([`apply ${restored}`]);
    expect(games.get(playing)?.status).toBe('played');
  });

  it('effects retract on reopen and on cancel from played', () => {
    const effect = new RecordingEffect();
    const s = service(effect);
    const a = game('played');
    const b = game('played');
    s.perform(a, 'reopen');
    s.perform(b, 'cancel');
    expect(effect.calls).toEqual([`retract ${a}`, `retract ${b}`]);
  });

  it('effects never fire on other moves', () => {
    const effect = new RecordingEffect();
    const s = service(effect);
    const id = game('open');
    s.perform(id, 'create');
    s.perform(id, 'confirm');
    s.perform(id, 'cancel');
    s.perform(id, 'uncancel');
    expect(effect.calls).toEqual([]);
  });

  it('a throwing effect leaves the state and cancelled_from unchanged', () => {
    const id = game('convocatoria_confirmed');
    expect(() => service(new ThrowingEffect()).perform(id, 'play')).toThrow(
      'effect failed'
    );
    expect(games.get(id)).toMatchObject({
      status: 'convocatoria_confirmed',
      cancelled_from: null,
    });
    const played = game('played');
    expect(() =>
      service(new ThrowingEffect()).perform(played, 'cancel')
    ).toThrow('effect failed');
    expect(games.get(played)).toMatchObject({
      status: 'played',
      cancelled_from: null,
    });
  });

  it('runs the work in the same transaction as the state write', () => {
    const id = game('open');
    expect(() =>
      service().perform(id, 'create', g => {
        games.update(g.id, { label: 'Bis' });
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(games.get(id)).toMatchObject({ status: 'open', label: null });
  });

  it('require throws the capability refusal for the stored state', () => {
    const s = service();
    expect(() => s.require(game('played'), 'edit_apuntados')).toThrow(
      'Reabre el partido para editarlo'
    );
    expect(() => s.require(game('open'), 'edit_apuntados')).not.toThrow();
  });

  it('describe offers registering payments only while a share is owed', () => {
    const id = game('played');
    const s = service();
    expect(s.describe(id)).toEqual({ state: 'played', nextAction: null });
    const player = conn
      .prepare("INSERT INTO players (name) VALUES ('Ana')")
      .run().lastInsertRowid;
    conn
      .prepare(
        `INSERT INTO share_debts (game_id, holder_player_id, beneficiary_player_id, amount_cents)
         VALUES (?, ?, ?, 400)`
      )
      .run(id, player, player);
    expect(s.describe(id)).toEqual({
      state: 'played',
      nextAction: 'Registrar pagos',
    });
  });
});
