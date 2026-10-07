import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import { GameLifecycle } from '../domain/game-lifecycle.js';
import { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import { PointsCalculator } from '../domain/points.js';
import { TestDatabase } from '../db/test-support.js';
import { ConvocatoriaEditService } from './convocatoria-edit-service.js';
import { ConvocatoriaRepository } from './convocatoria-repository.js';
import { ConvocatoriaService } from './convocatoria-service.js';
import { DebtRepository } from './debt-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { GameLifecycleService } from './game-lifecycle-service.js';
import { GameRepository } from './game-repository.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { PlayerRepository } from './player-repository.js';
import { SeasonRepository } from './season-repository.js';
import { StandingsService } from './standings-service.js';

describe('ConvocatoriaEditService', () => {
  let conn: Database.Database;
  let games: GameRepository;
  let players: PlayerRepository;
  let participations: ParticipationRepository;
  let guests: GuestCandidateRepository;
  let convocatorias: ConvocatoriaRepository;
  let service: ConvocatoriaService;
  let edits: ConvocatoriaEditService;
  let seasonId: number;
  let gameId: number;
  let ids: number[];

  /** A game with `count` regulars signed up and a stored convocatoria. */
  const gameWith = (count: number) => {
    const game = games.create(seasonId, `2025-10-${10 + nextDay++}`).id;
    const people = Array.from({ length: count }, (_, i) => {
      const p = players.add(
        seasonId,
        `G${game}-${String(i + 1).padStart(2, '0')}`,
        1
      );
      participations.set(game, p.id, { signed_up: true });
      return p.id;
    });
    service.create(game);
    return { game, people };
  };
  let nextDay = 0;
  const playingIds = (game: number) =>
    convocatorias
      .find(game)!
      .entries.filter(e => e.playing === 1)
      .map(e => e.player_id);

  beforeEach(() => {
    nextDay = 0;
    conn = TestDatabase.create();
    const seasons = new SeasonRepository(conn);
    players = new PlayerRepository(conn);
    games = new GameRepository(conn);
    participations = new ParticipationRepository(conn);
    guests = new GuestCandidateRepository(conn);
    convocatorias = new ConvocatoriaRepository(conn);
    const exclusions = new ExclusionRepository(conn);
    const standings = new StandingsService(
      players,
      exclusions,
      new DebtRepository(conn),
      new PointsCalculator(),
      conn
    );
    const lifecycle = new GameLifecycleService(
      games,
      new GameLifecycle(),
      new DebtRepository(conn),
      [],
      conn
    );
    service = new ConvocatoriaService(
      games,
      participations,
      exclusions,
      standings,
      new ConvocatoriaBuilder(),
      seasons,
      guests,
      players,
      new GuestSlotAllocator(),
      convocatorias,
      lifecycle
    );
    edits = new ConvocatoriaEditService(
      games,
      convocatorias,
      lifecycle,
      standings,
      players,
      conn
    );
    seasonId = seasons.create({ name: '2025/2026', slots: 14 }).id;
    ({ game: gameId, people: ids } = gameWith(16));
  });

  describe.each(['convocatoria_created', 'convocatoria_confirmed'] as const)(
    'in %s',
    state => {
      beforeEach(() => {
        if (state === 'convocatoria_confirmed') service.confirm(gameId);
      });

      it('swaps a member out and a reserve in, keeping the state and the chosen outcome', () => {
        edits.move(gameId, { playerId: ids[2] }, false);
        edits.move(gameId, { playerId: ids[14] }, true);

        expect(playingIds(gameId)).toContain(ids[14]);
        expect(playingIds(gameId)).not.toContain(ids[2]);
        const out = convocatorias.entryOf(gameId, { playerId: ids[2] })!;
        const inn = convocatorias.entryOf(gameId, { playerId: ids[14] })!;
        expect(out).toMatchObject({
          outcome: 'called_up',
          changed_by_hand: true,
        });
        expect(inn).toMatchObject({
          outcome: 'excluded',
          changed_by_hand: true,
        });
        expect(games.get(gameId)!.status).toBe(state);
        // Both stay signed up.
        expect(
          participations.list(gameId).filter(p => p.signed_up === 1)
        ).toHaveLength(16);
      });

      it('refuses a 15th member with "No quedan plazas" and writes nothing', () => {
        expect(() => edits.move(gameId, { playerId: ids[14] }, true)).toThrow(
          'No quedan plazas'
        );
        expect(convocatorias.playingCount(gameId)).toBe(14);
        expect(
          convocatorias.entryOf(gameId, { playerId: ids[14] })!.changed_by_hand
        ).toBe(false);
      });

      it('allows 13 members, and moving someone out of the line frees the seat', () => {
        edits.move(gameId, { playerId: ids[0] }, false);
        expect(convocatorias.playingCount(gameId)).toBe(13);
        edits.move(gameId, { playerId: ids[15] }, true);
        expect(convocatorias.playingCount(gameId)).toBe(14);
      });

      it('refuses to move someone who is not signed up', () => {
        const stranger = players.add(seasonId, 'Zeta', 1).id;
        expect(() => edits.move(gameId, { playerId: stranger }, true)).toThrow(
          'Zeta no está apuntado'
        );
      });

      it('refuses to drop a playing player from the sign-ups, and says nothing is written', () => {
        const keep = ids.slice(1).map(playerId => ({ playerId }));
        expect(() => edits.checkUnsign(gameId, keep)).toThrow(
          'Quítalo primero de la convocatoria'
        );
        expect(() => edits.requireNotMember(gameId, ids[0])).toThrow(
          'Quítalo primero de la convocatoria'
        );
        // A reserve can be dropped.
        expect(() =>
          edits.checkUnsign(
            gameId,
            ids.slice(0, 15).map(playerId => ({ playerId }))
          )
        ).not.toThrow();
        expect(() => edits.requireNotMember(gameId, ids[15])).not.toThrow();
      });
    }
  );

  it('refuses to edit before the convocatoria exists, and once the game is played or cancelled', () => {
    const open = games.create(seasonId, '2025-12-01').id;
    expect(() => edits.move(open, { playerId: ids[0] }, false)).toThrow(
      'Crea la convocatoria antes de editarla'
    );
    games.setState(gameId, 'played');
    expect(() => edits.move(gameId, { playerId: ids[0] }, false)).toThrow(
      'Reabre el partido para editarlo'
    );
    games.setState(gameId, 'cancelled', 'played');
    expect(() => edits.move(gameId, { playerId: ids[0] }, false)).toThrow(
      'El partido está cancelado'
    );
  });

  it('moves an anonymous plus-one by host and ordinal, and counts it in the cap', () => {
    const { game, people } = gameWith(13);
    guests.put(game, {
      position: 14,
      player_id: null,
      host_player_id: people[0],
    });
    service.create(game, { discardEdits: true });
    expect(convocatorias.playingCount(game)).toBe(14);

    const guest = { hostPlayerId: people[0], ordinal: 1 };
    edits.move(game, guest, false);
    expect(convocatorias.entryOf(game, guest)).toMatchObject({
      playing: 0,
      changed_by_hand: true,
    });
    edits.move(game, guest, true);
    expect(convocatorias.playingCount(game)).toBe(14);
  });

  describe('align', () => {
    it('gives a new sign-up an entry below the line, with its points and the next position', () => {
      const newcomer = players.add(seasonId, 'Nuevo', 1).id;
      participations.set(gameId, newcomer, { signed_up: true });
      const members = [...ids, newcomer].map(playerId => ({ playerId }));

      edits.align(gameId, members);

      const added = convocatorias.entryOf(gameId, { playerId: newcomer })!;
      expect(added).toMatchObject({
        playing: 0,
        outcome: 'excluded',
        position: 17,
      });
    });

    it('removes the entry of someone no longer signed up and not playing', () => {
      const members = ids.slice(0, 15).map(playerId => ({ playerId }));
      edits.align(gameId, members);
      expect(convocatorias.entryOf(gameId, { playerId: ids[15] })).toBeNull();
      expect(convocatorias.find(gameId)!.entries).toHaveLength(15);
    });

    it('adds and removes an anonymous plus-one', () => {
      const guest = { hostPlayerId: ids[0], ordinal: 1 };
      edits.align(gameId, [...ids.map(playerId => ({ playerId })), guest]);
      expect(convocatorias.entryOf(gameId, guest)).toMatchObject({
        playing: 0,
        name: expect.stringContaining('Invitado de'),
      });
      edits.align(
        gameId,
        ids.map(playerId => ({ playerId }))
      );
      expect(convocatorias.entryOf(gameId, guest)).toBeNull();
    });

    it('does nothing when the game has no convocatoria', () => {
      const open = games.create(seasonId, '2025-12-01').id;
      expect(() => edits.align(open, [{ playerId: ids[0] }])).not.toThrow();
      expect(() => edits.checkUnsign(open, [])).not.toThrow();
    });
  });
});
