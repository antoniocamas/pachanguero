import type Database from 'better-sqlite3';
import { BillingPlanner } from '../domain/billing-planner.js';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import { GameLifecycle } from '../domain/game-lifecycle.js';
import { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import { PlayedDerivation } from '../domain/played-derivation.js';
import { PointsCalculator } from '../domain/points.js';
import { TestDatabase } from '../db/test-support.js';
import { BillingEffect } from './billing-effect.js';
import { ConvocatoriaEditService } from './convocatoria-edit-service.js';
import { ConvocatoriaRepository } from './convocatoria-repository.js';
import { ConvocatoriaService } from './convocatoria-service.js';
import { DebtRepository } from './debt-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { GameLifecycleService } from './game-lifecycle-service.js';
import { GameRepository } from './game-repository.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { PaymentRepository } from './payment-repository.js';
import { PaymentService } from './payment-service.js';
import { PlayedOutcomeEffect } from './played-outcome-effect.js';
import { PlayerRepository } from './player-repository.js';
import { SeasonRepository } from './season-repository.js';
import { StandingsService } from './standings-service.js';

/**
 * A real in-memory database wired like production, for tests that walk a game
 * through create → confirm → play (and back) and look at what that records.
 */
export class GameFlow {
  readonly conn: Database.Database = TestDatabase.create();
  readonly seasons = new SeasonRepository(this.conn);
  readonly players = new PlayerRepository(this.conn);
  readonly games = new GameRepository(this.conn);
  readonly participations = new ParticipationRepository(this.conn);
  readonly exclusions = new ExclusionRepository(this.conn);
  readonly convocatorias = new ConvocatoriaRepository(this.conn);
  readonly debts = new DebtRepository(this.conn);
  readonly standings = new StandingsService(
    this.players,
    this.exclusions,
    this.debts,
    new PointsCalculator(),
    this.conn
  );
  readonly payments = new PaymentRepository(this.conn);
  readonly guests = new GuestCandidateRepository(this.conn);
  readonly lifecycle = new GameLifecycleService(
    this.games,
    new GameLifecycle(),
    this.debts,
    [
      new PlayedOutcomeEffect(
        this.convocatorias,
        new PlayedDerivation(),
        this.participations,
        this.exclusions
      ),
      new BillingEffect(
        this.convocatorias,
        this.guests,
        this.debts,
        this.payments,
        this.seasons,
        new BillingPlanner()
      ),
    ],
    this.conn
  );
  readonly paymentService = new PaymentService(
    this.games,
    this.lifecycle,
    this.debts,
    this.payments,
    this.participations,
    this.players,
    this.seasons,
    this.conn
  );
  readonly convocatoria = new ConvocatoriaService(
    this.games,
    this.participations,
    this.exclusions,
    this.standings,
    new ConvocatoriaBuilder(),
    this.seasons,
    this.guests,
    this.players,
    new GuestSlotAllocator(),
    this.convocatorias,
    this.lifecycle
  );
  readonly edits = new ConvocatoriaEditService(
    this.games,
    this.convocatorias,
    this.lifecycle,
    this.standings,
    this.players,
    this.conn
  );
  readonly seasonId = this.seasons.create({ name: '2025/2026' }).id;

  /** A new game on `playedOn` with `count` regulars signed up, named P01…. */
  gameWithSignups(
    playedOn: string,
    count: number
  ): { gameId: number; playerIds: number[] } {
    const gameId = this.games.create(this.seasonId, playedOn).id;
    const playerIds = Array.from({ length: count }, (_, i) => {
      const name = `P${String(i + 1).padStart(2, '0')}`;
      const player =
        this.players.list(this.seasonId).find(p => p.name === name) ??
        this.players.add(this.seasonId, name, 1);
      this.participations.set(gameId, player.id, { signed_up: true });
      return player.id;
    });
    return { gameId, playerIds };
  }

  /** Create and confirm the convocatoria, leaving the game ready to be played. */
  confirmed(gameId: number): void {
    this.convocatoria.create(gameId);
    this.convocatoria.confirm(gameId);
  }

  play(gameId: number): void {
    this.lifecycle.perform(gameId, 'play');
  }

  reopen(gameId: number): void {
    this.lifecycle.perform(gameId, 'reopen');
  }

  /** Create, confirm and play in one go. */
  played(gameId: number): void {
    this.confirmed(gameId);
    this.play(gameId);
  }

  exclusionRows(gameId: number): Array<{ player_id: number; kind: string }> {
    return this.conn
      .prepare(
        'SELECT player_id, kind FROM exclusions WHERE game_id = ? ORDER BY player_id'
      )
      .all(gameId) as Array<{ player_id: number; kind: string }>;
  }

  playedIds(gameId: number): number[] {
    return this.participations
      .list(gameId)
      .filter(p => p.played === 1)
      .map(p => p.player_id)
      .sort((a, b) => a - b);
  }
}
