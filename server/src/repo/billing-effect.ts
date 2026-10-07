import type { BillingPlanner } from '../domain/billing-planner.js';
import type { Share } from '../domain/debt-ledger.js';
import { ShareKey } from '../domain/share-key.js';
import type { ConvocatoriaRepository } from './convocatoria-repository.js';
import type { DebtRepository } from './debt-repository.js';
import type { GameRow } from './game-repository.js';
import type { PlayedEffect } from './game-lifecycle-service.js';
import type { GuestCandidateRepository } from './guest-candidate-repository.js';
import type { PaymentRepository } from './payment-repository.js';
import type { SeasonRepository } from './season-repository.js';

/**
 * Bills a game's shares when it is played: one debt per person who played,
 * held by their host when they came as a guest. Shares already billed or paid
 * are left as they are, so playing again never bills anything twice, and the
 * unpaid share of someone no longer playing is dropped. Reopening or cancelling
 * keeps every debt and payment.
 */
export class BillingEffect implements PlayedEffect {
  constructor(
    private readonly convocatorias: ConvocatoriaRepository,
    private readonly guests: GuestCandidateRepository,
    private readonly debts: DebtRepository,
    private readonly payments: PaymentRepository,
    private readonly seasons: SeasonRepository,
    private readonly planner: BillingPlanner
  ) {}

  apply(game: GameRow): void {
    const shares = this.sharesOf(game.id);
    const keys = new Set(shares.map(s => new ShareKey(s.member).toString()));
    const billed = new Set([
      ...this.debts.keysOf(game.id),
      ...this.payments.keysOf(game.id),
    ]);
    this.debts.deleteNotIn(game.id, keys);
    const amount = this.seasons.shareCents(game.season_id);
    for (const share of this.planner.unbilled(shares, billed))
      this.debts.insert(game.id, share.member, share.holderId, amount);
  }

  retract(): void {
    // Debts and payments outlive the game being played.
  }

  private sharesOf(gameId: number): Share[] {
    const hostOf = new Map(
      this.guests
        .list(gameId)
        .filter(g => g.player_id !== null)
        .map(g => [g.player_id!, g.host_player_id])
    );
    const entries = this.convocatorias.find(gameId)?.entries ?? [];
    return entries
      .filter(e => e.playing === 1)
      .map(e =>
        e.player_id !== null
          ? {
              member: { playerId: e.player_id },
              holderId: hostOf.get(e.player_id) ?? e.player_id,
            }
          : {
              member: {
                hostPlayerId: e.guest_host_player_id!,
                ordinal: e.guest_ordinal!,
              },
              holderId: e.guest_host_player_id!,
            }
      );
  }
}
