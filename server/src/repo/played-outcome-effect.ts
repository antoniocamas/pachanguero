import type { PlayedDerivation } from '../domain/played-derivation.js';
import type { ConvocatoriaRepository } from './convocatoria-repository.js';
import type { ExclusionRepository } from './exclusion-repository.js';
import type { GameRow } from './game-repository.js';
import type { PlayedEffect } from './game-lifecycle-service.js';
import type { ParticipationRepository } from './participation-repository.js';

/**
 * The sole writer of `played` and of a game's exclusion rows: both follow from
 * the game being played, so they are derived from its convocatoria when it
 * enters that state and withdrawn when it leaves. Payments and teams are
 * independent records and are never touched.
 */
export class PlayedOutcomeEffect implements PlayedEffect {
  constructor(
    private readonly convocatorias: ConvocatoriaRepository,
    private readonly derivation: PlayedDerivation,
    private readonly participations: ParticipationRepository,
    private readonly exclusions: ExclusionRepository
  ) {}

  apply(game: GameRow): void {
    const stored = this.convocatorias.find(game.id);
    const derived = this.derivation.derive(
      (stored?.entries ?? []).map(e => ({
        playerId: e.player_id,
        playing: e.playing === 1,
        outcome: e.outcome,
      }))
    );
    this.exclusions.clear(game.id);
    this.participations.setPlayedForGame(
      game.id,
      derived.filter(d => d.played).map(d => d.playerId)
    );
    for (const d of derived)
      this.exclusions.set(game.id, d.playerId, d.exclusion);
  }

  retract(game: GameRow): void {
    this.participations.setPlayedForGame(game.id, []);
    this.exclusions.clear(game.id);
  }
}
