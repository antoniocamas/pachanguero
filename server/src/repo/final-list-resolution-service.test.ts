import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { CandidateLineParser } from '../domain/candidate-line-parser.js';
import { FinalListParser } from '../domain/final-list-parser.js';
import { NameStripper } from '../domain/name-stripper.js';
import { TestDatabase } from '../db/test-support.js';
import { AliasRepository } from './alias-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { FinalListResolutionService } from './final-list-resolution-service.js';
import { FinalListTargetResolver } from './final-list-target-resolver.js';
import { GameRepository } from './game-repository.js';
import { LineResolver } from './line-resolver.js';
import { ParticipationRepository } from './participation-repository.js';
import { PlayerRegistrar } from './player-registrar.js';
import { PlayerRepository } from './player-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { SeasonRepository } from './season-repository.js';

describe('FinalListResolutionService', () => {
  let conn: Database.Database;
  let players: PlayerRepository;
  let participations: ParticipationRepository;
  let exclusions: ExclusionRepository;
  let games: GameRepository;
  let service: FinalListResolutionService;
  let seasonId: number;
  let gameId: number;

  const enrol = (name: string, seasons = 1) =>
    players.add(seasonId, name, seasons).id;
  const row = (name: string) =>
    participations.list(gameId).find(p => p.name === name);
  const exclusionKinds = () =>
    conn
      .prepare('SELECT player_id, kind FROM exclusions WHERE game_id = ?')
      .all(gameId) as { player_id: number; kind: string }[];
  /** Freeze a selection outcome, with the exclusion row it would have written. */
  const freeze = (
    outcomes: [number, 'called_up' | 'excluded' | 'demoted'][]
  ) => {
    const { lastInsertRowid } = conn
      .prepare(
        "INSERT INTO convocatorias (game_id, rules_json) VALUES (?, '{}')"
      )
      .run(gameId);
    outcomes.forEach(([playerId, outcome], i) => {
      conn
        .prepare(
          `INSERT INTO convocatoria_entries
             (convocatoria_id, player_id, position, points, outcome, playing)
           VALUES (?, ?, ?, 0, ?, ?)`
        )
        .run(
          lastInsertRowid,
          playerId,
          i + 1,
          outcome,
          outcome === 'called_up' ? 1 : 0
        );
      if (outcome !== 'called_up') {
        exclusions.set(
          gameId,
          playerId,
          outcome === 'excluded' ? 'points' : 'demoted'
        );
      }
    });
  };

  beforeEach(() => {
    conn = TestDatabase.create();
    players = new PlayerRepository(conn);
    participations = new ParticipationRepository(conn);
    exclusions = new ExclusionRepository(conn);
    games = new GameRepository(conn);
    const aliases = new AliasRepository(conn);
    const seasons = new SeasonRepository(conn);
    const schedule = new ScheduleRepository(conn);
    seasonId = seasons.create({ name: '2025/2026' }).id; // 5600 / 14 = 400 each
    gameId = games.create(seasonId, '2025-11-10').id;
    const stripper = new NameStripper();
    service = new FinalListResolutionService(
      games,
      new FinalListTargetResolver(games, schedule),
      players,
      participations,
      exclusions,
      seasons,
      new LineResolver(players, aliases, new PlayerRegistrar(players, aliases)),
      new FinalListParser(stripper),
      new CandidateLineParser(stripper),
      conn
    );
  });

  it('records attendance, team and payment when the list matches the selection', () => {
    const a = enrol('Ana');
    const b = enrol('Beto');
    freeze([
      [a, 'called_up'],
      [b, 'called_up'],
    ]);

    const result = service.paste(
      'Claros\n-----\nAna\nOscuros\n-----\nBeto',
      gameId
    );

    expect(result.unresolved).toEqual([]);
    expect(row('Ana')).toMatchObject({
      played: 1,
      team: 'claros',
      paid_cents: 400,
    });
    expect(row('Beto')).toMatchObject({
      played: 1,
      team: 'oscuros',
      paid_cents: 400,
    });
    expect(row('Ana')?.paid_on).not.toBeNull();
    expect(exclusionKinds()).toEqual([]);
    expect(games.get(gameId)?.status).toBe('played');
  });

  it('leaves an omitted player unplayed and bills the replacement', () => {
    const a = enrol('Ana');
    const b = enrol('Beto');
    const c = enrol('Cris');
    const d = enrol('Dani');
    freeze([
      [a, 'called_up'],
      [b, 'called_up'],
      [c, 'excluded'],
      [d, 'excluded'],
    ]);
    participations.set(gameId, b, { signed_up: true });

    // Beto did not turn up; Cris took his place; Dani stays out.
    service.paste('Claros\nAna\nOscuros\nCris', gameId);

    expect(row('Beto')).toMatchObject({ played: 0, paid_cents: 0 });
    expect(row('Cris')).toMatchObject({ played: 1, paid_cents: 400 });
    expect(exclusionKinds()).toEqual([{ player_id: d, kind: 'points' }]);
  });

  it('bills an unnamed companion to the player who brought them', () => {
    enrol('Fer');
    const result = service.paste('Claros\nFer +1', gameId);
    expect(row('Fer')).toMatchObject({ paid_cents: 800, guests: 1, played: 1 });
    expect(participations.list(gameId)).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({ companions: 1, paidCents: 800 });
  });

  it('accumulates several plus-ones for the same host', () => {
    enrol('Fer');
    service.paste('Claros\nFer +1\nOscuros\nFer +1', gameId);
    expect(row('Fer')).toMatchObject({ paid_cents: 1200, guests: 2 });
  });

  it('retracts an exclusion when the player played, and restores it when they did not', () => {
    const a = enrol('Ana');
    const c = enrol('Cris');
    freeze([
      [a, 'called_up'],
      [c, 'excluded'],
    ]);
    expect(exclusionKinds()).toEqual([{ player_id: c, kind: 'points' }]);

    service.paste('Claros\nAna\nOscuros\nCris', gameId);
    expect(exclusionKinds()).toEqual([]);
    expect(
      conn
        .prepare('SELECT outcome FROM convocatoria_entries WHERE player_id = ?')
        .get(c)
    ).toEqual({ outcome: 'excluded' }); // the frozen record is never rewritten

    service.paste('Claros\nAna', gameId);
    expect(exclusionKinds()).toEqual([{ player_id: c, kind: 'points' }]);
  });

  it('restores a demotion as a demotion', () => {
    const a = enrol('Ana');
    freeze([[a, 'demoted']]);
    service.paste('Claros\nAna', gameId);
    expect(exclusionKinds()).toEqual([]);
    service.paste('Claros\n-----', gameId);
    expect(exclusionKinds()).toEqual([{ player_id: a, kind: 'demoted' }]);
  });

  it('registers a brand-new guest named with their host, billed on their own', () => {
    const pablo = enrol('Pablo');
    const { unresolved } = service.paste(
      'Claros\nPablo\nOscuros\nJesus (Pablo)',
      gameId
    );
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({ team: 'oscuros', field: 'name' });

    const result = service.resolve(gameId, unresolved[0], {
      type: 'register',
      name: 'Jesus',
      introducedBy: pablo,
    });

    expect(result).toMatchObject({
      outcome: 'resolved',
      participant: { name: 'Jesus', team: 'oscuros', paidCents: 400 },
    });
    expect(row('Jesus')).toMatchObject({
      played: 1,
      team: 'oscuros',
      paid_cents: 400,
    });
    expect(row('Pablo')?.paid_cents).toBe(400);
    const jesus = players.listAll().find(p => p.name === 'Jesus')!;
    expect(
      conn
        .prepare('SELECT introduced_by FROM players WHERE id = ?')
        .get(jesus.id)
    ).toEqual({ introduced_by: pablo });
  });

  it('takes the introducing player from the annotation when none is given', () => {
    const pablo = enrol('Pablo');
    const { unresolved } = service.paste('Claros\nJesus (Pablo)', gameId);
    service.resolve(gameId, unresolved[0], { type: 'register', name: 'Jesus' });
    const jesus = players.listAll().find(p => p.name === 'Jesus')!;
    expect(
      conn
        .prepare('SELECT introduced_by FROM players WHERE id = ?')
        .get(jesus.id)
    ).toEqual({ introduced_by: pablo });
  });

  it('ignores the host when a named guest is already known', () => {
    enrol('Pablo');
    enrol('Juan');
    service.paste('Claros\nJuan (Pablo)', gameId);
    expect(row('Juan')?.paid_cents).toBe(400);
    expect(row('Pablo')).toBeUndefined();
  });

  it('takes a regular who was never a candidate', () => {
    enrol('Ana');
    expect(participations.list(gameId)).toEqual([]);
    service.paste('Claros\nAna', gameId);
    expect(row('Ana')).toMatchObject({
      signed_up: 1,
      played: 1,
      team: 'claros',
    });
  });

  it('retracts an exclusion as soon as an unresolved line is settled', () => {
    const a = enrol('Ana');
    const c = enrol('Cris');
    freeze([
      [a, 'called_up'],
      [c, 'excluded'],
    ]);
    const { unresolved } = service.paste(
      'Claros\nAna\nOscuros\nCrisito',
      gameId
    );
    expect(exclusionKinds()).toHaveLength(1);
    expect(games.get(gameId)?.status).toBe('scheduled');

    service.resolve(gameId, unresolved[0], {
      type: 'linkAsAlias',
      playerId: c,
    });
    expect(exclusionKinds()).toEqual([]);
    expect(row('Cris')).toMatchObject({ played: 1, team: 'oscuros' });
  });

  it('adds a companion for a host settled later', () => {
    const f = enrol('Fer');
    const { unresolved } = service.paste('Claros\nFeri +1', gameId);
    service.resolve(gameId, unresolved[0], { type: 'link', playerId: f });
    expect(row('Fer')).toMatchObject({ paid_cents: 800, guests: 1 });
  });

  it('flags a first appearance and suggests their seniority', () => {
    const olds = new SeasonRepository(conn).create({ name: '2022/2023' });
    const ana = players.add(olds.id, 'Ana', 3).id;
    enrol('Beto');
    const result = service.paste('Claros\nAna\nOscuros\nBeto', gameId);
    expect(result.matched.find(m => m.playerId === ana)).toMatchObject({
      seniorityPrompt: true,
      suggested: 4,
    });
    const beto = result.matched.find(m => m.name === 'Beto')!;
    expect(beto.seniorityPrompt).toBeUndefined();
  });

  it('writes nothing when the paste is malformed', () => {
    const a = enrol('Ana');
    freeze([[a, 'excluded']]);
    expect(() => service.paste('Ana\nClaros\nBeto', gameId)).toThrow(/Ana/);
    expect(participations.list(gameId)).toEqual([]);
    expect(exclusionKinds()).toHaveLength(1);
    expect(games.get(gameId)?.status).toBe('scheduled');
  });

  it('replaces a previous list but keeps who signed up', () => {
    enrol('Ana');
    enrol('Beto');
    participations.set(gameId, players.listAll()[0].id, { signed_up: true });
    service.paste('Claros\nAna\nBeto', gameId);
    service.paste('Claros\nAna', gameId);
    expect(row('Beto')).toMatchObject({ played: 0, team: null, paid_cents: 0 });
    expect(row('Beto')?.signed_up).toBe(1);
  });

  it('defaults to the game waiting for its final list', () => {
    enrol('Ana');
    const schedule = new ScheduleRepository(conn);
    schedule.create({
      weekday: 1,
      kickoff_time: '22:00',
      effective_from: '2025-09-01',
    });
    const result = service.paste(
      'Claros\nAna',
      undefined,
      new Date('2025-11-11T10:00')
    );
    expect(result.game.id).toBe(gameId);
  });

  it('refuses when no game awaits a list', () => {
    expect(() =>
      service.paste('Claros\nAna', undefined, new Date('2025-11-01T10:00'))
    ).toThrow(/ningún partido/);
  });
});
