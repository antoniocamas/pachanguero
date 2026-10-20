import type { OpenShare } from './bizum-rules.js';

/**
 * Which of a player's open shares a Bizum pays first: those of games played on or before the
 * Bizum's date, the latest game first; within a game the player's own share, then the shares
 * they hold for guests by ordinal, then by debt.
 */
export class NearestDebtOrder {
  order(
    shares: readonly OpenShare[],
    playerId: number,
    bookedOn: string
  ): OpenShare[] {
    return shares
      .filter(share => share.playedOn <= bookedOn)
      .sort(
        (a, b) =>
          b.playedOn.localeCompare(a.playedOn) ||
          b.gameId - a.gameId ||
          this.rank(a, playerId) - this.rank(b, playerId) ||
          this.ordinal(a) - this.ordinal(b) ||
          a.debtId - b.debtId
      );
  }

  private rank(share: OpenShare, playerId: number): number {
    return 'playerId' in share.member && share.member.playerId === playerId
      ? 0
      : 1;
  }

  private ordinal(share: OpenShare): number {
    return 'ordinal' in share.member ? share.member.ordinal : 0;
  }
}
