import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { AliasRepository } from './alias-repository.js';

describe('AliasRepository', () => {
  let conn: Database.Database;
  let aliases: AliasRepository;
  let jorge: number;
  let juan: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    aliases = new AliasRepository(conn);
    const players = new PlayerRepository(conn);
    const seasonId = new SeasonRepository(conn).create({
      name: '2025/2026',
    }).id;
    jorge = players.add(seasonId, 'Jorge Gutiérrez', 1).id;
    juan = players.add(seasonId, 'Juan', 1).id;
  });

  it('lists nothing before any alias is saved', () => {
    expect(aliases.listAll()).toEqual([]);
  });

  it('saves and lists aliases', () => {
    aliases.add(jorge, 'Guti');
    aliases.add(jorge, 'Gutito');
    expect(aliases.listAll()).toEqual([
      { playerId: jorge, alias: 'Guti' },
      { playerId: jorge, alias: 'Gutito' },
    ]);
  });

  it('ignores a duplicate (player, alias) pair', () => {
    aliases.add(jorge, 'Guti');
    aliases.add(jorge, 'Guti');
    expect(aliases.listAll()).toHaveLength(1);
  });

  it('lets two players share the same alias', () => {
    aliases.add(jorge, 'Juanito');
    aliases.add(juan, 'Juanito');
    expect(aliases.listAll().map(a => a.playerId)).toEqual([jorge, juan]);
  });
});
