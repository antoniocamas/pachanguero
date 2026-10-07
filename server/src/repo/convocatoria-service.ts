import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import { GuestOrdinals } from '../domain/guest-ordinals.js';
import type {
  Contender,
  ConvocatoriaResult,
  SeasonRules,
} from '../domain/types.js';
import { GameRepository, type GameRow } from './game-repository.js';
import {
  ParticipationRepository,
  type ParticipationRow,
} from './participation-repository.js';
import type {
  GuestCandidateRepository,
  GuestCandidateRow,
} from './guest-candidate-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import type { ConvocatoriaRepository } from './convocatoria-repository.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { StandingsService } from './standings-service.js';
import { SeasonRepository } from './season-repository.js';

export class ConvocatoriaService {
  constructor(
    private readonly games: GameRepository,
    private readonly participations: ParticipationRepository,
    private readonly exclusions: ExclusionRepository,
    private readonly standings: StandingsService,
    private readonly builder: ConvocatoriaBuilder,
    private readonly seasons: SeasonRepository,
    private readonly guests: GuestCandidateRepository,
    private readonly players: PlayerRepository,
    private readonly allocator: GuestSlotAllocator,
    private readonly convocatorias: ConvocatoriaRepository,
    private readonly lifecycle: GameLifecycleService
  ) {}

  /**
   * Run selection for a game without persisting it. While regulars alone fit
   * the slots, everyone regular is in and guests fill what is left by arrival
   * order; once regulars alone overflow, everybody is ranked by points.
   */
  preview(gameId: number): ConvocatoriaResult & { game: GameRow } {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`No game ${gameId}`);

    const rules = this.rulesOf(game);
    const signedUp = this.participations
      .list(gameId)
      .filter(p => p.signed_up === 1);
    const guestRows = this.guests.list(gameId);
    const namedGuestIds = new Set(
      guestRows.flatMap(g => (g.player_id === null ? [] : [g.player_id]))
    );
    const regulars = signedUp.filter(p => !namedGuestIds.has(p.player_id));

    const result =
      regulars.length <= rules.slots
        ? this.byArrival(game, signedUp, regulars.length, guestRows, rules)
        : this.byPoints(game, signedUp, guestRows, rules);
    return { ...result, game };
  }

  /**
   * Store the selection for a game, replacing any earlier one. It moves no
   * state and writes no exclusion: points for being left out are derived when
   * the game is played.
   */
  store(
    gameId: number,
    source: 'generated' | 'history'
  ): ConvocatoriaResult & { game: GameRow } {
    const result = this.preview(gameId);
    const ordinals = new GuestOrdinals(this.guests.list(gameId));
    this.convocatorias.replace(
      gameId,
      JSON.stringify(this.rulesOf(result.game)),
      result.entries.map(e => ({
        key: ordinals.keyOf(e.playerId),
        position: e.position,
        points: e.points,
        waitCounter: e.waitCounter,
        outcome: e.outcome,
        playing: e.playing,
      })),
      source
    );
    return result;
  }

  /**
   * Create (or recreate) the convocatoria and move the game to "created".
   * Recreating throws away hand corrections, so it refuses unless told to.
   */
  create(
    gameId: number,
    options: { discardEdits?: boolean } = {}
  ): ConvocatoriaResult & { game: GameRow } {
    let result!: ConvocatoriaResult & { game: GameRow };
    this.lifecycle.perform(gameId, 'create', () => {
      const signed = this.participations
        .list(gameId)
        .some(p => p.signed_up === 1);
      if (!signed) throw new Error('No hay nadie apuntado');
      const existing = this.convocatorias.find(gameId);
      if (
        !options.discardEdits &&
        existing?.entries.some(e => e.changed_by_hand)
      ) {
        throw new Error('Se perderán tus correcciones');
      }
      result = this.store(gameId, 'generated');
    });
    return { ...result, game: this.games.get(gameId)! };
  }

  /** Stamp the convocatoria as confirmed. It never recomputes anything. */
  confirm(gameId: number): void {
    this.lifecycle.perform(gameId, 'confirm', () =>
      this.convocatorias.confirm(gameId)
    );
  }

  saved(gameId: number) {
    const stored = this.convocatorias.find(gameId);
    if (!stored) return null;
    const { entries, ...head } = stored;
    return { ...head, rules: JSON.parse(head.rules_json), entries };
  }

  /** Regulars all play; guests take the remaining slots in order of arrival. */
  private byArrival(
    game: GameRow,
    signedUp: ParticipationRow[],
    regularsCount: number,
    guestRows: GuestCandidateRow[],
    rules: SeasonRules
  ): ConvocatoriaResult {
    const points = this.pointsOf(game);
    const namedGuestIds = new Set(guestRows.map(g => g.player_id));
    const regulars = signedUp
      .filter(p => !namedGuestIds.has(p.player_id))
      .map(p => ({
        playerId: p.player_id,
        name: p.name,
        points: points.get(p.player_id) ?? 0,
      }))
      .sort(
        (a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es')
      );

    const { calledUp, excluded } = this.allocator.allocate(
      regularsCount,
      guestRows,
      rules.slots
    );
    const names = this.nameLookup(signedUp);
    const guestEntry = (g: GuestCandidateRow, playing: boolean) => ({
      playerId: g.player_id ?? -g.position,
      name:
        g.player_id === null
          ? `Invitado de ${names.get(g.host_player_id) ?? '?'}`
          : (names.get(g.player_id) ?? '?'),
      points: g.player_id === null ? 0 : (points.get(g.player_id) ?? 0),
      playing,
    });

    const ordered = [
      ...regulars.map(r => ({ ...r, playing: true })),
      ...calledUp.map(g => guestEntry(g, true)),
      ...excluded.map(g => guestEntry(g, false)),
    ];
    return {
      entries: ordered.map((e, i) => ({
        ...e,
        position: i + 1,
        outcome: e.playing ? 'called_up' : 'excluded',
        waitCounter: 0,
      })),
      swaps: [],
      oversubscribed: false,
    };
  }

  /**
   * Everyone competes on points. Anonymous guests join as zero-point
   * stand-ins with negative ids, which no real player can have.
   */
  private byPoints(
    game: GameRow,
    signedUp: ParticipationRow[],
    guestRows: GuestCandidateRow[],
    rules: SeasonRules
  ): ConvocatoriaResult {
    const table = this.standings.standings(game.season_id, game.id);
    const enrolled = new Set(table.map(s => s.playerId));
    const missing = signedUp.filter(p => !enrolled.has(p.player_id));
    if (missing.length) {
      throw new Error(
        `Falta la antigüedad de: ${missing.map(p => p.name).join(', ')}`
      );
    }

    const signedIds = new Set(signedUp.map(p => p.player_id));
    const names = this.nameLookup(signedUp);
    const contenders: Contender[] = [
      ...table
        .filter(s => signedIds.has(s.playerId))
        .map(s => ({ playerId: s.playerId, name: s.name, points: s.points })),
      ...guestRows
        .filter(g => g.player_id === null)
        .map(g => ({
          playerId: -g.position,
          name: `Invitado de ${names.get(g.host_player_id) ?? '?'}`,
          points: 0,
        })),
    ];
    const history = this.exclusions.historyFor(game.season_id, game.id);
    return this.builder.build(contenders, history, rules);
  }

  private pointsOf(game: GameRow): Map<number, number> {
    return new Map(
      this.standings
        .standings(game.season_id, game.id)
        .map(s => [s.playerId, s.points])
    );
  }

  private nameLookup(signedUp: ParticipationRow[]): Map<number, string> {
    const names = new Map(signedUp.map(p => [p.player_id, p.name]));
    for (const p of this.players.listAll()) {
      if (!names.has(p.id)) names.set(p.id, p.name);
    }
    return names;
  }

  private rulesOf(game: GameRow): SeasonRules {
    return this.seasons.rulesOf(this.seasons.get(game.season_id)!);
  }
}
