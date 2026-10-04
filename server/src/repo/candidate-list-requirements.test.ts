import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { CandidateLineParser } from '../domain/candidate-line-parser.js';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import { NameStripper } from '../domain/name-stripper.js';
import { PointsCalculator } from '../domain/points.js';
import { TestDatabase } from '../db/test-support.js';
import { AliasRepository } from './alias-repository.js';
import {
  CandidateResolutionService,
  type CandidateLine,
  type CandidateRow,
} from './candidate-resolution-service.js';
import { CandidateLineRepository } from './candidate-line-repository.js';
import { ConvocatoriaService } from './convocatoria-service.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { GameDayResolutionService } from './game-day-resolution-service.js';
import { GameRepository } from './game-repository.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { PlayerRegistrar } from './player-registrar.js';
import { PlayerRepository } from './player-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { SeasonRepository } from './season-repository.js';
import { StandingsService } from './standings-service.js';

/**
 * The core-logic requirements of WP-001 UC-001-03 (candidate list) and
 * UC-001-08 (which game), as Given/When/Then, run through the real services
 * from the list the organiser saves to the convocatoria it produces. How the
 * list is edited on screen is a UX matter and is not decided here.
 */
describe('WP-001 candidate list requirements', () => {
  let conn: Database.Database;
  let players: PlayerRepository;
  let participations: ParticipationRepository;
  let guests: GuestCandidateRepository;
  let candidates: CandidateResolutionService;
  let convocatoria: ConvocatoriaService;
  let games: GameRepository;
  let seasonId: number;
  let gameId: number;

  const enrol = (name: string) => players.add(seasonId, name, 1).id;
  const L = (...texts: string[]): CandidateLine[] =>
    texts.map(text => ({ text }));
  const nameOf = (id: number) => players.nameOf(id);
  const signedUp = () =>
    participations
      .list(gameId)
      .filter(p => p.signed_up)
      .map(p => p.name)
      .sort();
  const unresolved = (rows: CandidateRow[]) =>
    rows.flatMap(r => (r.status === 'unresolved' ? r.entry : []));

  beforeEach(() => {
    conn = TestDatabase.create();
    const seasons = new SeasonRepository(conn);
    players = new PlayerRepository(conn);
    games = new GameRepository(conn);
    participations = new ParticipationRepository(conn);
    guests = new GuestCandidateRepository(conn);
    const aliases = new AliasRepository(conn);
    const exclusions = new ExclusionRepository(conn);
    const schedule = new ScheduleRepository(conn);
    schedule.create({
      weekday: 1,
      kickoff_time: '22:00',
      effective_from: '2025-09-01',
    });
    seasonId = seasons.create({ name: '2025/2026', slots: 14 }).id;
    gameId = games.create(seasonId, '2025-11-10').id;
    candidates = new CandidateResolutionService(
      games,
      new GameDayResolutionService(games, schedule, seasons),
      players,
      aliases,
      participations,
      guests,
      new CandidateLineRepository(conn),
      new CandidateLineParser(new NameStripper()),
      new PlayerRegistrar(players, aliases),
      conn
    );
    convocatoria = new ConvocatoriaService(
      games,
      participations,
      exclusions,
      new StandingsService(
        players,
        exclusions,
        seasons,
        new PointsCalculator(),
        conn
      ),
      new ConvocatoriaBuilder(),
      seasons,
      guests,
      players,
      new GuestSlotAllocator(),
      conn
    );
  });

  describe('UC-001-03-S1 — clean paste, everyone matched', () => {
    it('makes every line a signed-up candidate and leaves no name unresolved', () => {
      // Given a numbered WhatsApp-style list whose names all match a player or alias
      enrol('Ana');
      const beto = enrol('Beto');
      new AliasRepository(conn).add(beto, 'Betito');
      const rows = candidates.preview(gameId, [], '1. Ana ⚽\n2. Betito');

      // When the organiser saves it for the game
      candidates.save(
        gameId,
        rows.map(r => ({ text: r.text }))
      );

      // Then every line is a candidate and none is unresolved
      expect(unresolved(rows)).toEqual([]);
      expect(signedUp()).toEqual(['Ana', 'Beto']);
    });
  });

  describe('UC-001-03-S2 — an unmatched name blocks nothing silently', () => {
    it('shows the matched candidates beside the unresolved name and creates no candidate for it', () => {
      // Given a list where one line matches no canonical name or alias
      enrol('Ana');

      // When the organiser saves it
      const rows = candidates.save(gameId, L('Ana', 'Desconocido'));

      // Then the matched ones are shown beside the unresolved name, and the
      // unresolved line has no candidate entry and no player until resolved
      expect(rows.map(r => r.status)).toEqual(['matched', 'unresolved']);
      expect(signedUp()).toEqual(['Ana']);
      expect(players.listAll().map(p => p.name)).toEqual(['Ana']);
    });
  });

  describe('UC-001-03-S3 — a "Reservas" section is not turned into candidates', () => {
    it('drops the names beneath it without asking to resolve them', () => {
      // Given a list with a trailing "Reservas" heading and names beneath it
      enrol('Ana');

      // When the organiser submits the paste
      const rows = candidates.preview(
        gameId,
        [],
        '1. Ana\nReservas\n2. Beto\n3. Cris'
      );

      // Then those names are neither candidates nor unresolved names
      expect(rows.map(r => r.text)).toEqual(['Ana']);
    });
  });

  describe('UC-001-03-S4 — named occasional guest', () => {
    it('first appearance: stores the guest as "Adri" alone, with David as the host link', () => {
      // Given a line "Adri (David)" where Adri matches no existing player
      const david = enrol('David');
      const [entry] = unresolved(
        candidates.preview(gameId, [], '1. Adri (David)')
      );

      // When the organiser resolves it by registering Adri
      candidates.resolve(gameId, entry, {
        type: 'register',
        name: 'Adri',
        introducedBy: david,
      });
      candidates.save(gameId, [{ text: 'Adri (David)', introduced: true }]);

      // Then the stored player is named "Adri", never "Adri (David)", with a
      // pointer to David, and is an ordinary candidate for this game
      const adri = players.listAll().find(p => p.name.startsWith('Adri'))!;
      expect(adri.name).toBe('Adri');
      expect(
        conn
          .prepare('SELECT introduced_by FROM players WHERE id = ?')
          .get(adri.id)
      ).toEqual({ introduced_by: david });
      expect(signedUp()).toEqual(['Adri']);
      expect(guests.list(gameId)).toEqual([
        { position: 1, player_id: adri.id, host_player_id: david },
      ]);
    });

    it('already known from an earlier game: resolves like any known player, no special case', () => {
      // Given "Juan (David)" where Juan is already a known player (even one
      // David introduced)
      const david = enrol('David');
      const juan = players.register('Juan', david).id;

      // When the organiser saves the list
      const rows = candidates.save(gameId, L('Juan (David)'));

      // Then Juan is an ordinary candidate: matched, and not a guest
      expect(rows[0]).toMatchObject({
        status: 'matched',
        candidate: { playerId: juan, guest: null },
      });
      expect(guests.list(gameId)).toEqual([]);
    });
  });

  describe('UC-001-03-S5 — anonymous plus-one is an ephemeral candidate', () => {
    it('creates a slot for the companion without a player record, attributed to the host', () => {
      // Given a line "Álvaro +1" naming a known player and an unnamed companion
      const alvaro = enrol('Álvaro');
      const before = players.listAll().length;

      // When the organiser saves the list
      candidates.save(gameId, L('Álvaro +1'));

      // Then a nameless candidate exists for this game, attributed to Álvaro,
      // and no player was created for it
      expect(guests.list(gameId)).toEqual([
        { position: 1, player_id: null, host_player_id: alvaro },
      ]);
      expect(players.listAll()).toHaveLength(before);
    });
  });

  describe('UC-001-03-S6 — guests compete by arrival order, not points', () => {
    it("runs the organiser's example: 11 regulars + Adri #8, Álvaro +1 #12, Juan #13, Rubén #14", () => {
      // Given 11 regulars and four guests at list positions 8, 12, 13 and 14
      const regulars = Array.from({ length: 11 }, (_, i) =>
        enrol(`R${String(i + 1).padStart(2, '0')}`)
      );
      const host = (i: number) => nameOf(regulars[i])!;
      const lines = [
        'R01',
        'R02',
        'R03',
        'R04',
        'R05',
        'R06',
        'R07',
        `Adri (${host(0)})`,
        'R08',
        'R09',
        'R10',
        `${host(2)} +1`,
        `Juan (${host(1)})`,
        `Rubén (${host(3)})`,
        'R11',
      ];
      for (const entry of unresolved(
        candidates.preview(gameId, [], lines.join('\n'))
      )) {
        if (entry.line.kind !== 'hostAnnotated') continue;
        const host = players
          .listAll()
          .find(p => p.name === (entry.line as { hostName: string }).hostName);
        candidates.resolve(gameId, entry, {
          type: 'register',
          name: entry.line.name,
          introducedBy: host?.id,
        });
      }
      candidates.save(
        gameId,
        lines.map(text => ({
          text,
          ...(text.includes('(') && { introduced: true as const }),
        }))
      );
      expect(guests.list(gameId).map(g => g.position)).toEqual([8, 12, 13, 14]);

      // When the organiser commits the convocatoria
      const result = convocatoria.commit(gameId);

      // Then all regulars are called up plus the three earliest-positioned
      // guests, and Rubén, the latest, is excluded
      const playing = result.entries.filter(e => e.playing);
      const playingNames = playing.map(e =>
        e.playerId < 0 ? `+1 #${-e.playerId}` : nameOf(e.playerId)
      );
      expect(playing).toHaveLength(14);
      expect(playingNames).toEqual(
        expect.arrayContaining(['Adri', '+1 #12', 'Juan'])
      );
      expect(playingNames).not.toContain('Rubén');
      expect(playingNames.filter(n => n?.startsWith('R'))).toHaveLength(11);
    });
  });

  describe('UC-001-08 — the game is resolved from the weekly schedule', () => {
    it('S1: pasting before game day targets the upcoming game, created if missing', () => {
      // Given a weekly game day (Monday) and no game yet for the next one
      // When a list is made on the Tuesday before it
      const id = candidates.target('next', new Date('2025-11-18T10:00'));

      // Then it belongs to the next occurrence, created automatically
      expect(games.get(id)!.played_on).toBe('2025-11-24');
    });

    it('S2: pasting on game day itself targets today, not the following week', () => {
      // Given today is the configured game day
      // When a list is made on it
      const id = candidates.target('next', new Date('2025-11-10T09:00'));

      // Then it belongs to today's game
      expect(id).toBe(gameId);
      expect(games.get(id)!.played_on).toBe('2025-11-10');
    });
  });
});
