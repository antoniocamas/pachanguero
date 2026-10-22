import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { AliasRepository } from './alias-repository.js';
import { ContactRepository } from './contact-repository.js';
import { GameRepository } from './game-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { PlayerDeletionService } from './player-deletion-service.js';
import { PlayerHostRepository } from './player-host-repository.js';
import { PlayerRepository } from './player-repository.js';
import { SeasonRepository } from './season-repository.js';
import { UserRepository } from './user-repository.js';

describe('PlayerDeletionService', () => {
  let conn: Database.Database;
  let players: PlayerRepository;
  let users: UserRepository;
  let service: PlayerDeletionService;
  let seasonId: number;

  const exists = (id: number) => players.nameOf(id) !== undefined;

  beforeEach(() => {
    conn = TestDatabase.create();
    players = new PlayerRepository(conn);
    users = new UserRepository(conn);
    service = new PlayerDeletionService(players, users, conn);
    seasonId = new SeasonRepository(conn).create({ name: '2026/2027' }).id;
  });

  it('deletes a player created by mistake, with what is theirs alone', () => {
    const wrong = players.add(seasonId, 'Pepe Error', 1).id;
    new AliasRepository(conn).add(wrong, 'Pepito');
    new ContactRepository(conn).save(wrong, {
      emails: ['pepe@example.com'],
      phone: '600111222',
    });
    players.addBizumName(wrong, 'PEPE E.');
    new PlayerHostRepository(conn).add(wrong, players.register('Ana').id);

    service.delete(wrong);

    expect(exists(wrong)).toBe(false);
    for (const table of [
      'player_aliases',
      'player_emails',
      'player_contacts',
      'player_bizum_names',
      'player_hosts',
      'season_players',
    ]) {
      expect(
        conn
          .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?`)
          .get(wrong)
      ).toEqual({ n: 0 });
    }
  });

  it('refuses a player with an account', () => {
    const luis = players.register('Luis').id;
    users.create({
      username: 'luis',
      passwordHash: 'x',
      role: 'regular',
      playerId: luis,
    });

    expect(() => service.delete(luis)).toThrow('tiene usuario');
    expect(exists(luis)).toBe(true);
  });

  it('refuses a player who took part in a game, naming why and pointing to merging', () => {
    const ana = players.register('Ana').id;
    const game = new GameRepository(conn).create(seasonId, '2026-10-07').id;
    new ParticipationRepository(conn).set(game, ana, { signed_up: true });

    expect(() => service.delete(ana)).toThrow(
      'No se puede borrar a Ana: está apuntado o ha jugado algún partido. Si es la misma persona que otro jugador, fúndelos'
    );
    expect(exists(ana)).toBe(true);
  });

  it('refuses a player who introduced someone or usually hosts someone', () => {
    const david = players.register('David').id;
    players.register('Adri', david);
    expect(() => service.delete(david)).toThrow('presentó a otro jugador');

    const caro = players.register('Caro').id;
    new PlayerHostRepository(conn).add(players.register('Beto').id, caro);
    expect(() => service.delete(caro)).toThrow('anfitrión habitual');
  });

  it('refuses an unknown player', () => {
    expect(() => service.delete(999)).toThrow('Unknown player');
  });
});
