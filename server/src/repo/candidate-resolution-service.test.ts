import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { CandidateLineParser } from '../domain/candidate-line-parser.js';
import { NameStripper } from '../domain/name-stripper.js';
import { TestDatabase } from '../db/test-support.js';
import { AliasRepository } from './alias-repository.js';
import { CandidateResolutionService } from './candidate-resolution-service.js';
import { GameDayResolutionService } from './game-day-resolution-service.js';
import { GameRepository } from './game-repository.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { PlayerRegistrar } from './player-registrar.js';
import { PlayerRepository } from './player-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { SeasonRepository } from './season-repository.js';

describe('CandidateResolutionService', () => {
  let conn: Database.Database;
  let players: PlayerRepository;
  let aliases: AliasRepository;
  let participations: ParticipationRepository;
  let guests: GuestCandidateRepository;
  let service: CandidateResolutionService;
  let gameId: number;
  let seasonId: number;

  const enrol = (name: string) => players.add(seasonId, name, 1).id;
  const signedUp = () =>
    participations
      .list(gameId)
      .filter(p => p.signed_up)
      .map(p => p.name);

  beforeEach(() => {
    conn = TestDatabase.create();
    players = new PlayerRepository(conn);
    aliases = new AliasRepository(conn);
    participations = new ParticipationRepository(conn);
    guests = new GuestCandidateRepository(conn);
    const games = new GameRepository(conn);
    const seasons = new SeasonRepository(conn);
    const schedule = new ScheduleRepository(conn);
    schedule.create({
      weekday: 1,
      kickoff_time: '22:00',
      effective_from: '2025-09-01',
    });
    seasonId = seasons.create({ name: '2025/2026' }).id;
    gameId = games.create(seasonId, '2025-11-10').id;
    service = new CandidateResolutionService(
      games,
      new GameDayResolutionService(games, schedule, seasons),
      players,
      aliases,
      participations,
      guests,
      new CandidateLineParser(new NameStripper()),
      new PlayerRegistrar(players, aliases),
      conn
    );
  });

  it('signs up everyone on a clean paste', () => {
    enrol('Ana');
    enrol('Beto');
    const result = service.paste('1 Ana ⚽\n2. Beto', gameId);
    expect(result.unresolved).toEqual([]);
    expect(result.matched.map(m => m.name)).toEqual(['Ana', 'Beto']);
    expect(signedUp()).toEqual(['Ana', 'Beto']);
    expect(guests.list(gameId)).toEqual([]);
  });

  it('targets the next game day when no game is given', () => {
    enrol('Ana');
    const result = service.paste(
      '1 Ana',
      undefined,
      new Date('2025-11-05T10:00')
    );
    expect(result.game.id).toBe(gameId);
    expect(result.game.played_on).toBe('2025-11-10');
  });

  it('reports an unmatched name and stores nothing for it', () => {
    enrol('Ana');
    const result = service.paste('1 Ana\n2 Desconocido', gameId);
    expect(result.matched).toHaveLength(1);
    expect(result.unresolved).toEqual([
      {
        line: { position: 2, kind: 'plain', name: 'Desconocido' },
        field: 'name',
        reason: 'unmatched',
        candidates: [],
      },
    ]);
    expect(signedUp()).toEqual(['Ana']);
  });

  it('reports an ambiguous name with the players it could be', () => {
    const a = enrol('Juanito');
    const b = enrol('Juan');
    aliases.add(b, 'Juanito');
    const result = service.paste('1 Juanito', gameId);
    expect(result.unresolved[0]).toMatchObject({
      reason: 'ambiguous',
      candidates: [
        { id: a, name: 'Juanito' },
        { id: b, name: 'Juan' },
      ],
    });
    expect(signedUp()).toEqual([]);
  });

  it('settles an ambiguous name by linking, without touching the others', () => {
    enrol('Ana');
    const a = enrol('Juanito');
    const b = enrol('Juan');
    aliases.add(b, 'Juanito');
    const { unresolved } = service.paste('1 Ana\n2 Juanito', gameId);

    const result = service.resolve(gameId, unresolved[0], {
      type: 'link',
      playerId: a,
    });
    expect(result).toMatchObject({
      outcome: 'resolved',
      candidate: { playerId: a, name: 'Juanito', guest: null },
    });
    expect(signedUp()).toEqual(['Ana', 'Juanito']);
  });

  it('drops the Reservas section from both lists', () => {
    enrol('Ana');
    const result = service.paste('1 Ana\nReservas\n2 Beto\n3 Cris', gameId);
    expect(result.matched).toHaveLength(1);
    expect(result.unresolved).toEqual([]);
  });

  it('registers a first-time named guest and records their host', () => {
    enrol('Ana');
    const david = enrol('David');
    const { unresolved } = service.paste('1 Ana\n2 Adri (David)', gameId);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({ field: 'name', reason: 'unmatched' });

    const result = service.resolve(gameId, unresolved[0], {
      type: 'register',
      name: 'Adri',
      introducedBy: david,
    });
    expect(result).toMatchObject({
      outcome: 'resolved',
      candidate: { name: 'Adri', hostPlayerId: david, guest: 'named' },
    });
    expect(signedUp()).toEqual(['Adri', 'Ana']);
    expect(guests.list(gameId)).toEqual([
      expect.objectContaining({ position: 2, host_player_id: david }),
    ]);
    const adri = players.listAll().find(p => p.name === 'Adri')!;
    expect(guests.list(gameId)[0].player_id).toBe(adri.id);
    expect(
      conn
        .prepare('SELECT introduced_by FROM players WHERE id = ?')
        .get(adri.id)
    ).toEqual({ introduced_by: david });
  });

  it('takes the host from the annotation when none is given', () => {
    const david = enrol('David');
    const { unresolved } = service.paste('1 Adri (David)', gameId);
    service.resolve(gameId, unresolved[0], { type: 'register', name: 'Adri' });
    expect(guests.list(gameId)[0].host_player_id).toBe(david);
  });

  it('treats an already-known player with a host annotation as a regular', () => {
    enrol('David');
    enrol('Juan');
    const result = service.paste('1 Juan (David)', gameId);
    expect(result.unresolved).toEqual([]);
    expect(result.matched[0]).toMatchObject({ name: 'Juan', guest: null });
    expect(guests.list(gameId)).toEqual([]);
    expect(signedUp()).toEqual(['Juan']);
  });

  it('records an anonymous plus-one against the host', () => {
    const alvaro = enrol('Álvaro');
    const result = service.paste('1 Álvaro +1', gameId);
    expect(result.matched[0]).toMatchObject({
      playerId: null,
      hostPlayerId: alvaro,
      guest: 'anonymous',
    });
    expect(signedUp()).toEqual(['Álvaro']);
    expect(guests.list(gameId)).toEqual([
      { position: 1, player_id: null, host_player_id: alvaro },
    ]);
  });

  it('leaves a line unresolved when its host is unknown', () => {
    enrol('Juan');
    const result = service.paste('1 Juan (Nadie)', gameId);
    expect(result.unresolved[0]).toMatchObject({ field: 'host' });
    const plus = service.paste('1 Nadie +1', gameId);
    expect(plus.unresolved[0]).toMatchObject({ field: 'host' });
    expect(signedUp()).toEqual([]);
  });

  it('saves the pasted spelling as an alias when linking as alias', () => {
    const jorge = enrol('Jorge Gutiérrez');
    const { unresolved } = service.paste('1 Guti ⚽', gameId);
    service.resolve(gameId, unresolved[0], {
      type: 'linkAsAlias',
      playerId: jorge,
    });
    expect(aliases.listAll()).toEqual([{ playerId: jorge, alias: 'Guti' }]);
    expect(service.paste('1 Guti', gameId).unresolved).toEqual([]);
  });

  it('returns a collision unresolved instead of linking silently', () => {
    const pablo = enrol('Pablo');
    const { unresolved } = service.paste('1 Pabli', gameId);
    const result = service.resolve(gameId, unresolved[0], {
      type: 'register',
      name: 'Pablo',
    });
    expect(result).toMatchObject({
      outcome: 'unresolved',
      entry: {
        reason: 'collision',
        candidates: [{ id: pablo, name: 'Pablo' }],
      },
    });
    expect(signedUp()).toEqual([]);
  });

  it('replaces the previous paste, keeping attendance and payment', () => {
    enrol('Ana');
    enrol('Beto');
    enrol('Cris');
    enrol('David');
    service.paste('1 Ana\n2 Beto\n3 David +1', gameId);
    const ana = players.listAll().find(p => p.name === 'Ana')!;
    participations.set(gameId, ana.id, { played: true, paid_cents: 500 });

    service.paste('1 Ana\n2 Cris', gameId);

    expect(signedUp()).toEqual(['Ana', 'Cris']);
    expect(guests.list(gameId)).toEqual([]);
    expect(
      participations.list(gameId).find(p => p.name === 'Ana')
    ).toMatchObject({
      played: 1,
      paid_cents: 500,
    });
    expect(
      participations.list(gameId).find(p => p.name === 'Beto')?.signed_up
    ).toBe(0);
  });

  it('rejects an unknown game', () => {
    expect(() => service.paste('1 Ana', 999)).toThrow(/Unknown game/);
  });
});
