import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { AliasRepository } from './alias-repository.js';
import { PlayerRegistrar } from './player-registrar.js';
import { PlayerRepository } from './player-repository.js';

describe('PlayerRegistrar', () => {
  let conn: Database.Database;
  let players: PlayerRepository;
  let aliases: AliasRepository;
  let registrar: PlayerRegistrar;

  const count = () =>
    (conn.prepare('SELECT COUNT(*) AS n FROM players').get() as { n: number })
      .n;

  beforeEach(() => {
    conn = TestDatabase.create();
    players = new PlayerRepository(conn);
    aliases = new AliasRepository(conn);
    registrar = new PlayerRegistrar(players, aliases);
  });

  it('registers a new player with no host', () => {
    const result = registrar.register('Nuevo');
    expect(result).toMatchObject({
      outcome: 'registered',
      player: { name: 'Nuevo', introducedBy: null },
    });
  });

  it('records who introduced the new player', () => {
    const david = players.register('David');
    const result = registrar.register('Adri', david.id);
    expect(result).toMatchObject({
      outcome: 'registered',
      player: { name: 'Adri', introducedBy: david.id },
    });
  });

  it('reports a collision with an existing name and creates nothing', () => {
    const pablo = players.register('Pablo');
    const before = count();
    expect(registrar.register('Pablo')).toEqual({
      outcome: 'collision',
      match: { outcome: 'matched', playerId: pablo.id },
    });
    expect(registrar.register(' pablo ')).toMatchObject({
      outcome: 'collision',
    });
    expect(count()).toBe(before);
  });

  it('reports a collision with an alias', () => {
    const jorge = players.register('Jorge Gutiérrez');
    aliases.add(jorge.id, 'Guti');
    expect(registrar.register('Guti')).toEqual({
      outcome: 'collision',
      match: { outcome: 'matched', playerId: jorge.id },
    });
  });

  it('reports an ambiguous collision when several players fit', () => {
    const a = players.register('Juanito');
    const b = players.register('Juan');
    aliases.add(b.id, 'Juanito');
    expect(registrar.register('Juanito')).toEqual({
      outcome: 'collision',
      match: { outcome: 'ambiguous', playerIds: [a.id, b.id] },
    });
  });

  it('enrols the new player in no season', () => {
    registrar.register('Nuevo');
    expect(
      conn.prepare('SELECT COUNT(*) AS n FROM season_players').get()
    ).toEqual({ n: 0 });
  });
});
