import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { GameRepository } from './game-repository.js';
import { ParticipationRepository } from './participation-repository.js';

describe('ParticipationRepository', () => {
  let conn: Database.Database;
  let participations: ParticipationRepository;
  let gameId: number;
  let playerId: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    const seasonId = new SeasonRepository(conn).create({
      name: '2025/2026',
    }).id;
    playerId = new PlayerRepository(conn).add(seasonId, 'Ana').id;
    gameId = new GameRepository(conn).create(seasonId, '2025-09-08').id;
    participations = new ParticipationRepository(conn);
  });

  it('creates a row on first set and lists it with the player name', () => {
    participations.set(gameId, playerId, { signed_up: true });
    expect(participations.list(gameId)).toMatchObject([
      { name: 'Ana', signed_up: 1 },
    ]);
  });

  it('stamps paid_on when paid_cents turns positive with no explicit paid_on', () => {
    const today = new Date().toISOString().slice(0, 10);
    participations.set(gameId, playerId, { played: true });
    participations.set(gameId, playerId, { paid_cents: 400 });
    const [row] = participations.list(gameId);
    expect(row.paid_cents).toBe(400);
    expect(row.paid_on).toBe(today);
  });

  it('clears paid_on when paid_cents is reversed to zero', () => {
    participations.set(gameId, playerId, { paid_cents: 400 });
    participations.set(gameId, playerId, { paid_cents: 0 });
    expect(participations.list(gameId)[0].paid_on).toBeNull();
  });

  it('respects an explicit paid_on instead of stamping today', () => {
    participations.set(gameId, playerId, {
      paid_cents: 400,
      paid_on: '2025-01-01',
    });
    expect(participations.list(gameId)[0].paid_on).toBe('2025-01-01');
  });

  it('removes a participation row', () => {
    participations.set(gameId, playerId, { signed_up: true });
    participations.remove(gameId, playerId);
    expect(participations.list(gameId)).toEqual([]);
  });
});
