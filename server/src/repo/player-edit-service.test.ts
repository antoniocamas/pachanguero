import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { AliasRepository } from './alias-repository.js';
import { PlayerEditService } from './player-edit-service.js';
import { PlayerRepository } from './player-repository.js';
import { SeasonRepository } from './season-repository.js';

describe('PlayerEditService', () => {
  let players: PlayerRepository;
  let aliases: AliasRepository;
  let edit: PlayerEditService;
  let javier: number;
  let fer: number;

  beforeEach(() => {
    const conn = TestDatabase.create();
    players = new PlayerRepository(conn);
    aliases = new AliasRepository(conn);
    edit = new PlayerEditService(players, aliases, conn);
    const season = new SeasonRepository(conn).create({ name: '2025/2026' }).id;
    javier = players.add(season, 'Javier', 1).id;
    fer = players.add(season, 'Fer', 1).id;
  });

  it('lists every player with their aliases', () => {
    aliases.add(javier, 'Javi');
    expect(edit.list().find(p => p.id === javier)).toEqual({
      id: javier,
      name: 'Javier',
      introducedBy: null,
      aliases: ['Javi'],
    });
  });

  it('promotes an alias to principal name, dropping it as an alias', () => {
    aliases.add(javier, 'Javi');
    const updated = edit.update(javier, {
      name: 'Javi',
      keepOldAsAlias: true,
    });
    expect(updated).toMatchObject({ name: 'Javi', aliases: ['Javier'] });
  });

  it('forgets the old name when asked not to keep it', () => {
    edit.update(javier, { name: 'Javi' });
    expect(edit.list().find(p => p.id === javier)).toMatchObject({
      name: 'Javi',
      aliases: [],
    });
  });

  it("refuses another player's name, in any case", () => {
    expect(() => edit.update(javier, { name: 'FER' })).toThrow(
      /ya es el nombre/
    );
  });

  it('records and clears who introduced a player', () => {
    expect(edit.update(javier, { introducedBy: fer }).introducedBy).toBe(fer);
    expect(edit.update(javier, { introducedBy: null }).introducedBy).toBeNull();
    expect(() => edit.update(javier, { introducedBy: javier })).toThrow();
  });

  it('adds and removes aliases', () => {
    edit.addAlias(javier, ' Javi ');
    edit.addAlias(javier, 'Xavi');
    edit.removeAlias(javier, 'Javi');
    expect(aliases.listAll()).toEqual([{ playerId: javier, alias: 'Xavi' }]);
  });

  it('rejects an unknown player', () => {
    expect(() => edit.update(999, { name: 'X' })).toThrow(/Unknown/);
  });
});
