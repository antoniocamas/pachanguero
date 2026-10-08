import { ConvocatoriaEditService } from './convocatoria-edit-service.js';
import { ConvocatoriaRepository } from './convocatoria-repository.js';
import { StandingsService } from './standings-service.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { PointsCalculator } from '../domain/points.js';
import { GameLifecycle } from '../domain/game-lifecycle.js';
import { DebtRepository } from './debt-repository.js';
import { GameLifecycleService } from './game-lifecycle-service.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { CandidateLineParser } from '../domain/candidate-line-parser.js';
import { NameStripper } from '../domain/name-stripper.js';
import { TestDatabase } from '../db/test-support.js';
import { AliasRepository } from './alias-repository.js';
import { CandidateLineRepository } from './candidate-line-repository.js';
import {
  CandidateResolutionService,
  type CandidateRow,
} from './candidate-resolution-service.js';
import { GameDayResolutionService } from './game-day-resolution-service.js';
import { GameRepository } from './game-repository.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { PlayerRegistrar } from './player-registrar.js';
import { PlayerRepository } from './player-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { SeasonRepository } from './season-repository.js';

describe('CandidateResolutionService', () => {
  let convocatorias: ConvocatoriaRepository;
  let conn: Database.Database;
  let players: PlayerRepository;
  let aliases: AliasRepository;
  let participations: ParticipationRepository;
  let guests: GuestCandidateRepository;
  let service: CandidateResolutionService;
  let gameId: number;
  let seasonId: number;
  let seasons: SeasonRepository;

  const enrol = (name: string) => players.add(seasonId, name, 1).id;
  const L = (...texts: string[]) => texts.map(text => ({ text }));
  const matchedNames = (rows: CandidateRow[]) =>
    rows.flatMap(r => (r.status === 'matched' ? (r.candidate.name ?? []) : []));
  const unresolvedOf = (rows: CandidateRow[]) =>
    rows.flatMap(r => (r.status === 'unresolved' ? r.entry : []));
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
    seasons = new SeasonRepository(conn);
    const schedule = new ScheduleRepository(conn);
    schedule.create({
      weekday: 1,
      kickoff_time: '22:00',
      effective_from: '2025-09-01',
    });
    seasonId = seasons.create({ name: '2025/2026' }).id;
    gameId = games.create(seasonId, '2025-11-10').id;
    convocatorias = new ConvocatoriaRepository(conn);
    const lifecycle = new GameLifecycleService(
      games,
      new GameLifecycle(),
      new DebtRepository(conn),
      [],
      conn
    );
    service = new CandidateResolutionService(
      games,
      new GameDayResolutionService(games, schedule, seasons),
      players,
      aliases,
      participations,
      guests,
      new CandidateLineRepository(conn),
      new CandidateLineParser(new NameStripper()),
      new PlayerRegistrar(players, aliases),
      lifecycle,
      new ConvocatoriaEditService(
        games,
        convocatorias,
        lifecycle,
        new StandingsService(
          players,
          new ExclusionRepository(conn),
          new DebtRepository(conn),
          new PointsCalculator(),
          conn
        ),
        players,
        conn
      ),
      conn
    );
  });

  describe('target', () => {
    it('is the game given', () => {
      expect(service.target(String(gameId))).toBe(gameId);
    });

    it('is the next game day for "next", with no game created by hand', () => {
      expect(service.target('next', new Date('2025-11-05T10:00'))).toBe(gameId);
    });

    it('is created for "next" when that game day has no game yet', () => {
      const id = service.target('next', new Date('2025-11-12T10:00'));
      expect(id).not.toBe(gameId);
    });

    it('rejects anything else', () => {
      expect(() => service.target('ayer')).toThrow(/game/i);
    });
  });

  describe('preview', () => {
    it('reads each line against the known players and stores nothing', () => {
      enrol('Ana');
      const rows = service.preview(gameId, L(), '1 Ana ⚽\n2. Desconocido');
      expect(rows.map(r => [r.position, r.text, r.status])).toEqual([
        [1, 'Ana', 'matched'],
        [2, 'Desconocido', 'unresolved'],
      ]);
      expect(signedUp()).toEqual([]);
      expect(service.load(gameId)).toEqual([]);
    });

    it('adds a paste after the lines already there, keeping their order', () => {
      enrol('Ana');
      enrol('Beto');
      enrol('Cris');
      const rows = service.preview(gameId, L('Cris', 'Ana'), '1 Beto');
      expect(matchedNames(rows)).toEqual(['Cris', 'Ana', 'Beto']);
      expect(rows.map(r => r.position)).toEqual([1, 2, 3]);
    });

    it('folds a player listed twice into the first place, however it is spelled', () => {
      const jorge = enrol('Jorge Gutiérrez');
      aliases.add(jorge, 'Guti');
      enrol('Ana');
      const rows = service.preview(
        gameId,
        L('Jorge Gutiérrez', 'Ana'),
        'guti\nANA\nAna'
      );
      expect(matchedNames(rows)).toEqual(['Jorge Gutiérrez', 'Ana']);
    });

    it('folds the same unmatched text into one row', () => {
      const rows = service.preview(gameId, L('Nuevo'), 'nuevo\nNuevo');
      expect(rows).toHaveLength(1);
    });

    it('keeps every plus-one, since each is a different guest', () => {
      enrol('Álvaro');
      const rows = service.preview(gameId, L(), 'Álvaro\nÁlvaro +1\nÁlvaro +1');
      expect(rows).toHaveLength(3);
    });

    it('drops the Reservas section and headings from a paste', () => {
      enrol('Ana');
      const rows = service.preview(
        gameId,
        [],
        'Claros\n-----\n1 Ana\nReservas\n2 Beto'
      );
      expect(rows.map(r => r.text)).toEqual(['Ana']);
    });

    it('reports an ambiguous name with the players it could be', () => {
      const a = enrol('Juanito');
      const b = enrol('Juan');
      aliases.add(b, 'Juanito');
      const [entry] = unresolvedOf(service.preview(gameId, L(), '1 Juanito'));
      expect(entry).toMatchObject({
        reason: 'ambiguous',
        candidates: [
          { id: a, name: 'Juanito' },
          { id: b, name: 'Juan' },
        ],
      });
    });

    it('leaves a line unresolved when its host is unknown', () => {
      enrol('Juan');
      expect(
        unresolvedOf(service.preview(gameId, L(), '1 Juan (Nadie)'))[0]
      ).toMatchObject({ field: 'host' });
      expect(
        unresolvedOf(service.preview(gameId, L(), '1 Nadie +1'))[0]
      ).toMatchObject({
        field: 'host',
      });
    });

    it('treats an already-known player with a host annotation as a regular', () => {
      enrol('David');
      enrol('Juan');
      const [row] = service.preview(gameId, L(), '1 Juan (David)');
      expect(row).toMatchObject({
        status: 'matched',
        candidate: { name: 'Juan', guest: null },
      });
    });

    it('reports a guest whose name is already listed with another host, never folding them', () => {
      enrol('Fer');
      enrol('Caro');
      const javi = enrol('Javi');
      const rows = service.preview(gameId, L(), 'Javi (Fer)\nJavi (Caro)');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ status: 'matched' });
      expect(unresolvedOf(rows)).toMatchObject([
        {
          field: 'name',
          reason: 'duplicate',
          candidates: [{ id: javi, name: 'Javi' }],
        },
      ]);
    });

    it('still folds the same guest pasted twice with the same host', () => {
      enrol('Fer');
      enrol('Javi');
      expect(
        service.preview(gameId, L(), 'Javi (Fer)\nJavi (Fer)')
      ).toHaveLength(1);
    });

    it("respects the organiser's choice of a different player for the repeated name", () => {
      enrol('Fer');
      const caro = enrol('Caro');
      enrol('Javi');
      const other = enrol('Javi de Caro');
      const rows = service.preview(gameId, [
        { text: 'Javi (Fer)' },
        { text: 'Javi (Caro)', links: { name: other } },
      ]);
      expect(matchedNames(rows)).toEqual(['Javi', 'Javi de Caro']);
      expect(caro).toBeGreaterThan(0);
    });

    it('records an anonymous plus-one against the host', () => {
      const alvaro = enrol('Álvaro');
      const [row] = service.preview(gameId, L(), '1 Álvaro +1');
      expect(row).toMatchObject({
        status: 'matched',
        candidate: { playerId: null, hostPlayerId: alvaro, guest: 'anonymous' },
      });
    });
  });

  describe('save', () => {
    it('signs up the matched players and keeps the list for later', () => {
      enrol('Ana');
      enrol('Beto');
      const rows = service.save(gameId, L('Ana', 'Desconocido', 'Beto'));
      expect(rows.map(r => r.status)).toEqual([
        'matched',
        'unresolved',
        'matched',
      ]);
      expect(signedUp()).toEqual(['Ana', 'Beto']);
      expect(service.load(gameId).map(r => r.text)).toEqual([
        'Ana',
        'Desconocido',
        'Beto',
      ]);
    });

    it('stores nothing as a player for an unmatched name', () => {
      enrol('Ana');
      service.save(gameId, L('Ana', 'Desconocido'));
      expect(players.listAll().map(p => p.name)).toEqual(['Ana']);
      expect(signedUp()).toEqual(['Ana']);
    });

    it('saves the list consolidated', () => {
      enrol('Ana');
      service.save(gameId, L('Ana', 'ana'));
      expect(service.load(gameId).map(r => r.text)).toEqual(['Ana']);
    });

    it('replaces the previous list, keeping attendance and payment', () => {
      enrol('Ana');
      enrol('Beto');
      enrol('Cris');
      enrol('David');
      service.save(gameId, L('Ana', 'Beto', 'David +1'));
      const ana = players.listAll().find(p => p.name === 'Ana')!;
      participations.set(gameId, ana.id, { played: true, paid_cents: 500 });

      service.save(gameId, L('Ana', 'Cris'));

      expect(signedUp()).toEqual(['Ana', 'Cris']);
      expect(guests.list(gameId)).toEqual([]);
      expect(
        participations.list(gameId).find(p => p.name === 'Ana')
      ).toMatchObject({ played: 1, paid_cents: 500 });
      expect(
        participations.list(gameId).find(p => p.name === 'Beto')?.signed_up
      ).toBe(0);
    });

    it('an empty list clears the game', () => {
      enrol('Ana');
      service.save(gameId, L('Ana'));
      service.save(gameId, L());
      expect(signedUp()).toEqual([]);
      expect(service.load(gameId)).toEqual([]);
    });

    it('records an anonymous plus-one and signs up its host', () => {
      const alvaro = enrol('Álvaro');
      service.save(gameId, L('Álvaro +1'));
      expect(signedUp()).toEqual(['Álvaro']);
      expect(guests.list(gameId)).toEqual([
        { position: 1, player_id: null, host_player_id: alvaro },
      ]);
    });

    describe('with a stored convocatoria', () => {
      const entry = (playerId: number, position: number, playing: boolean) => ({
        key: { playerId },
        position,
        points: 1,
        waitCounter: 0,
        outcome: playing ? ('called_up' as const) : ('excluded' as const),
        playing,
      });
      let ana: number;
      let beto: number;

      beforeEach(() => {
        ana = enrol('Ana');
        beto = enrol('Beto');
        service.save(gameId, L('Ana', 'Beto'));
        convocatorias.replace(gameId, '{"slots":14}', [
          entry(ana, 1, true),
          entry(beto, 2, false),
        ]);
      });

      it('gives a newly signed-up player an entry below the line', () => {
        enrol('Cris');
        service.save(gameId, L('Ana', 'Beto', 'Cris'));
        const cris = convocatorias
          .find(gameId)!
          .entries.find(e => e.name === 'Cris')!;
        expect(cris).toMatchObject({
          playing: 0,
          outcome: 'excluded',
          position: 3,
        });
      });

      it('gives a newly added plus-one an entry named after its host', () => {
        service.save(gameId, L('Ana', 'Beto', 'Ana +1'));
        expect(
          convocatorias.entryOf(gameId, { hostPlayerId: ana, ordinal: 1 })
        ).toMatchObject({ playing: 0, name: 'Invitado de Ana' });
      });

      it('drops the entry of someone signed out who was not playing', () => {
        service.save(gameId, L('Ana'));
        expect(convocatorias.entryOf(gameId, { playerId: beto })).toBeNull();
        expect(signedUp()).toEqual(['Ana']);
      });

      it('refuses to sign out someone who is playing, and writes nothing', () => {
        expect(() => service.save(gameId, L('Beto'))).toThrow(
          'Quítalo primero de la convocatoria'
        );
        expect(signedUp()).toEqual(['Ana', 'Beto']);
        expect(service.load(gameId).map(r => r.text)).toEqual(['Ana', 'Beto']);
        expect(convocatorias.find(gameId)!.entries).toHaveLength(2);
      });
    });

    it('rejects an unknown game', () => {
      expect(() => service.save(999, L('Ana'))).toThrow(/Unknown game/);
      expect(() => service.load(999)).toThrow(/Unknown game/);
    });
  });

  describe('seniority', () => {
    it('asks for the seniority of a player who has not yet appeared this season, with a suggestion', () => {
      const first = seasons.create({ name: '2024/2025' }).id;
      const veteran = players.add(first, 'Vera', 3).id;
      const rows = service.preview(gameId, L('Vera'));
      expect(rows[0]).toMatchObject({
        status: 'matched',
        candidate: { playerId: veteran, seniorityPrompt: true, suggested: 4 },
      });
    });

    it('stops asking once the seniority is confirmed for the season', () => {
      const first = seasons.create({ name: '2024/2025' }).id;
      players.add(first, 'Vera', 3);
      players.add(seasonId, 'Vera', 4);
      const [row] = service.preview(gameId, L('Vera'));
      expect(row).toMatchObject({ status: 'matched' });
      expect(
        (row as { candidate: { seniorityPrompt?: true } }).candidate
          .seniorityPrompt
      ).toBeUndefined();
    });

    it('does not ask about a player already enrolled this season, nor about a nameless +1', () => {
      enrol('Ana');
      const rows = service.preview(gameId, L('Ana', 'Ana +1'));
      for (const r of rows) {
        expect(
          (r as { candidate: { seniorityPrompt?: true } }).candidate
            .seniorityPrompt
        ).toBeUndefined();
      }
    });
  });

  describe('links', () => {
    it("settles an ambiguous name for this line only, by the organiser's choice", () => {
      const a = enrol('Juanito');
      const b = enrol('Juan');
      aliases.add(b, 'Juanito');
      expect(service.preview(gameId, L('Juanito'))[0].status).toBe(
        'unresolved'
      );

      const rows = service.preview(gameId, [
        { text: 'Juanito', links: { name: a } },
      ]);
      expect(rows[0]).toMatchObject({
        status: 'matched',
        links: { name: a },
        candidate: { playerId: a, name: 'Juanito' },
      });
    });

    it('keeps a link when saved, and signs the chosen player up', () => {
      const a = enrol('Juanito');
      const b = enrol('Juan');
      aliases.add(b, 'Juanito');
      service.save(gameId, [{ text: 'Juanito', links: { name: a } }]);
      expect(signedUp()).toEqual(['Juanito']);
      expect(service.load(gameId)[0]).toMatchObject({
        status: 'matched',
        links: { name: a },
      });
      expect(aliases.listAll()).toEqual([{ playerId: b, alias: 'Juanito' }]);
    });

    it('links the host of an annotated line', () => {
      const a = enrol('Juanito');
      const b = enrol('Juan');
      aliases.add(b, 'Juanito');
      enrol('Ana');
      const rows = service.preview(gameId, [
        { text: 'Ana (Juanito)', links: { host: a } },
      ]);
      expect(rows[0].status).toBe('matched');
    });

    it('ignores a link to a player that no longer exists', () => {
      expect(
        service.preview(gameId, [{ text: 'Nadie', links: { name: 999 } }])[0]
          .status
      ).toBe('unresolved');
    });

    it('refuses to settle a link as if it were a player change', () => {
      const a = enrol('Juanito');
      const [entry] = unresolvedOf(service.preview(gameId, L('Pedro')));
      expect(() =>
        service.resolve(gameId, entry, { type: 'link', playerId: a })
      ).toThrow(/link/);
    });
  });

  describe('a game signed up before lists were saved', () => {
    const signUpEarlierGame = () => {
      const ana = enrol('Ana');
      const beto = enrol('Beto');
      const cris = enrol('Cris');
      const david = enrol('David');
      const adri = players.register('Adri', david).id;
      for (const id of [beto, ana, david, adri, cris]) {
        participations.set(gameId, id, { signed_up: true });
      }
      guests.replaceAll(gameId, [
        { position: 2, player_id: adri, host_player_id: david },
        { position: 5, player_id: null, host_player_id: ana },
      ]);
    };

    it('shows its sign-ups as the list, each guest back in the place it arrived in', () => {
      signUpEarlierGame();
      const rows = service.load(gameId);
      expect(rows.map(r => r.text)).toEqual([
        'Ana',
        'Adri (David)',
        'Beto',
        'Cris',
        'Ana +1',
        'David',
      ]);
      expect(rows.every(r => r.status === 'matched')).toBe(true);
      expect(rows[1]).toMatchObject({ introduced: true });
      expect(signedUp()).toHaveLength(5);
    });

    it("keeps the guests' arrival positions when that list is saved as it is", () => {
      signUpEarlierGame();
      const before = guests.list(gameId);
      service.save(
        gameId,
        service.load(gameId).map(r => ({
          text: r.text,
          ...(r.introduced && { introduced: true }),
        }))
      );
      expect(
        guests
          .list(gameId)
          .map(g => [g.position, g.player_id, g.host_player_id])
      ).toEqual(before.map(g => [g.position, g.player_id, g.host_player_id]));
    });

    it('keeps guests in their relative order when positions run past the list', () => {
      const ana = enrol('Ana');
      const beto = enrol('Beto');
      participations.set(gameId, ana, { signed_up: true });
      participations.set(gameId, beto, { signed_up: true });
      guests.replaceAll(gameId, [
        { position: 9, player_id: null, host_player_id: ana },
        { position: 12, player_id: null, host_player_id: beto },
      ]);
      expect(service.load(gameId).map(r => r.text)).toEqual([
        'Ana',
        'Beto',
        'Ana +1',
        'Beto +1',
      ]);
    });

    it('is not used once a list has been saved', () => {
      const ana = enrol('Ana');
      enrol('Beto');
      participations.set(gameId, ana, { signed_up: true });
      service.save(gameId, L('Beto'));
      expect(service.load(gameId).map(r => r.text)).toEqual(['Beto']);
    });
  });

  describe('load', () => {
    it('sees a name settled after the list was saved as matched', () => {
      const ana = enrol('Ana');
      service.save(gameId, L('Ana', 'Anita'));
      aliases.add(ana, 'Anita');
      expect(unresolvedOf(service.load(gameId))).toEqual([]);
    });

    it('does not sign anyone up by reading', () => {
      const ana = enrol('Ana');
      service.save(gameId, L('Ana'));
      participations.set(gameId, ana, { signed_up: false });
      service.load(gameId);
      expect(signedUp()).toEqual([]);
    });
  });

  describe('resolve', () => {
    it('saves the pasted spelling as an alias when linking as alias', () => {
      const jorge = enrol('Jorge Gutiérrez');
      const [entry] = unresolvedOf(service.preview(gameId, L(), '1 Guti ⚽'));
      service.resolve(gameId, entry, { type: 'linkAsAlias', playerId: jorge });
      expect(aliases.listAll()).toEqual([{ playerId: jorge, alias: 'Guti' }]);
      expect(unresolvedOf(service.preview(gameId, L('Guti')))).toEqual([]);
    });

    it("registers a first-time named guest, who is that host's guest on the line that registered them", () => {
      enrol('Ana');
      const david = enrol('David');
      const [entry] = unresolvedOf(
        service.preview(gameId, [], '1 Ana\n2 Adri (David)')
      );
      expect(entry).toMatchObject({ field: 'name', reason: 'unmatched' });

      service.resolve(gameId, entry, {
        type: 'register',
        name: 'Adri',
        introducedBy: david,
      });

      const rows = service.save(gameId, [
        { text: 'Ana' },
        { text: 'Adri (David)', introduced: true },
      ]);
      expect(rows[1]).toMatchObject({
        status: 'matched',
        introduced: true,
        candidate: { name: 'Adri', hostPlayerId: david, guest: 'named' },
      });
      expect(signedUp()).toEqual(['Adri', 'Ana']);
      const adri = players.listAll().find(p => p.name === 'Adri')!;
      expect(guests.list(gameId)).toEqual([
        { position: 2, player_id: adri.id, host_player_id: david },
      ]);
      expect(service.load(gameId)[1]).toMatchObject({ introduced: true });
    });

    it('treats a known player written with a host as a regular, even one that host once introduced', () => {
      const david = enrol('David');
      const adri = players.register('Adri', david).id;
      const [row] = service.preview(gameId, L('Adri (David)'));
      expect(row).toMatchObject({
        status: 'matched',
        candidate: { playerId: adri, guest: null },
      });
    });

    it('takes the host from the annotation when none is given', () => {
      enrol('David');
      const [entry] = unresolvedOf(
        service.preview(gameId, L(), '1 Adri (David)')
      );
      service.resolve(gameId, entry, { type: 'register', name: 'Adri' });
      expect(unresolvedOf(service.preview(gameId, L('Adri (David)')))).toEqual(
        []
      );
    });

    it('returns a collision unresolved instead of linking silently', () => {
      const pablo = enrol('Pablo');
      const [entry] = unresolvedOf(service.preview(gameId, L(), '1 Pabli'));
      expect(
        service.resolve(gameId, entry, { type: 'register', name: 'Pablo' })
      ).toMatchObject({
        outcome: 'unresolved',
        entry: {
          reason: 'collision',
          candidates: [{ id: pablo, name: 'Pablo' }],
        },
      });
    });

    it('rejects an unknown game', () => {
      expect(() =>
        service.resolve(
          999,
          { line: { position: 1, kind: 'plain', name: 'Ana' }, field: 'name' },
          { type: 'register', name: 'Ana' }
        )
      ).toThrow(/Unknown game/);
    });
  });
});
