import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { ConvocatoriaRepository } from './convocatoria-repository.js';
import { GameRepository } from './game-repository.js';
import { PlayerRepository } from './player-repository.js';
import { SeasonRepository } from './season-repository.js';

describe('ConvocatoriaRepository', () => {
  let conn: Database.Database;
  let repo: ConvocatoriaRepository;
  let gameId: number;
  let ana: number;
  let beto: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    const seasonId = new SeasonRepository(conn).create({
      name: '2025/2026',
    }).id;
    const players = new PlayerRepository(conn);
    ana = players.add(seasonId, 'Ana', 1).id;
    beto = players.add(seasonId, 'Beto', 1).id;
    gameId = new GameRepository(conn).create(seasonId, '2025-09-08').id;
    repo = new ConvocatoriaRepository(conn);
  });

  const entry = (playerId: number, position: number, playing = true) => ({
    key: { playerId },
    position,
    points: 2.5,
    waitCounter: 0,
    outcome: playing ? ('called_up' as const) : ('excluded' as const),
    playing,
  });
  const plusOne = (
    hostPlayerId: number,
    ordinal: number,
    position: number
  ) => ({
    key: { hostPlayerId, ordinal },
    position,
    points: 0,
    waitCounter: 0,
    outcome: 'called_up' as const,
    playing: true,
  });
  const count = (table: string) =>
    (conn.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
      .n;

  it('finds nothing for a game without a convocatoria', () => {
    expect(repo.find(gameId)).toBeNull();
  });

  it('round-trips the head and the entries ordered by position, with names', () => {
    repo.replace(gameId, '{"slots":14}', [
      entry(beto, 2, false),
      entry(ana, 1),
    ]);
    const found = repo.find(gameId)!;
    expect(found.rules_json).toBe('{"slots":14}');
    expect(found).toMatchObject({ confirmed_at: null, source: 'generated' });
    expect(found.entries.map(e => [e.name, e.position, e.playing])).toEqual([
      ['Ana', 1, 1],
      ['Beto', 2, 0],
    ]);
    expect(found.entries[1]).toMatchObject({
      points: 2.5,
      wait_counter: 0,
      outcome: 'excluded',
    });
  });

  it('stores an anonymous plus-one as an entry named after its host', () => {
    repo.replace(gameId, '{}', [entry(ana, 1), plusOne(ana, 1, 2)]);
    const [, guest] = repo.find(gameId)!.entries;
    expect(guest).toMatchObject({
      player_id: null,
      guest_host_player_id: ana,
      guest_ordinal: 1,
      name: 'Invitado de Ana',
    });
  });

  it('keeps the source it was stored with', () => {
    repo.replace(gameId, '{}', [], 'history');
    expect(repo.find(gameId)!.source).toBe('history');
  });

  it('confirm stamps only the head', () => {
    repo.replace(gameId, '{}', [entry(ana, 1)]);
    const before = repo.find(gameId)!;
    repo.confirm(gameId);
    const after = repo.find(gameId)!;
    expect(after.confirmed_at).not.toBeNull();
    expect(after.entries).toEqual(before.entries);
  });

  it('replacing twice leaves one head and no orphan entries', () => {
    repo.replace(gameId, '{}', [entry(ana, 1), entry(beto, 2)]);
    repo.replace(gameId, '{}', [entry(ana, 1)]);
    expect(count('convocatorias')).toBe(1);
    expect(count('convocatoria_entries')).toBe(1);
  });

  it('is removed with its game', () => {
    repo.replace(gameId, '{}', [entry(ana, 1)]);
    conn.prepare('DELETE FROM games WHERE id = ?').run(gameId);
    expect(repo.find(gameId)).toBeNull();
    expect(count('convocatoria_entries')).toBe(0);
  });

  it('derives "changed by hand" from playing against what the selection chose', () => {
    repo.replace(gameId, '{}', [entry(ana, 1), entry(beto, 2, false)]);
    const [a, b] = repo.find(gameId)!.entries;
    expect([a.changed_by_hand, b.changed_by_hand]).toEqual([false, false]);
    repo.setPlaying(a.id, false);
    repo.setPlaying(b.id, true);
    expect(
      repo.find(gameId)!.entries.map(e => [e.playing, e.changed_by_hand])
    ).toEqual([
      [0, true],
      [1, true],
    ]);
    expect(repo.find(gameId)!.entries[0].outcome).toBe('called_up');
  });

  it('finds an entry by player or by host and ordinal, and counts who plays', () => {
    repo.replace(gameId, '{}', [
      entry(ana, 1),
      plusOne(ana, 1, 2),
      entry(beto, 3, false),
    ]);
    expect(repo.entryOf(gameId, { playerId: beto })?.name).toBe('Beto');
    expect(repo.entryOf(gameId, { hostPlayerId: ana, ordinal: 1 })?.name).toBe(
      'Invitado de Ana'
    );
    expect(repo.entryOf(gameId, { hostPlayerId: ana, ordinal: 2 })).toBeNull();
    expect(repo.playingCount(gameId)).toBe(2);
  });

  it('adds and removes an entry', () => {
    repo.replace(gameId, '{}', [entry(ana, 1)]);
    repo.addEntry(gameId, entry(beto, 2, false));
    expect(repo.find(gameId)!.entries).toHaveLength(2);
    repo.removeEntry(repo.entryOf(gameId, { playerId: beto })!.id);
    expect(repo.find(gameId)!.entries).toHaveLength(1);
  });
});
