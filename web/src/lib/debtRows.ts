import type { Debt, OutstandingShare } from '../api';
import type { GameRow } from './gameRows';
import { keyOf } from './shares';

/** The share as the game screen keeps it, so its payment cell reads it the same. */
export const debtOf = (s: OutstandingShare): Debt => ({
  id: s.id,
  game_id: s.gameId,
  holder_player_id: s.holderId,
  beneficiary_player_id: s.beneficiaryId,
  guest_ordinal: s.guestOrdinal,
  amount_cents: s.amountCents,
});

/** The debts of one game among the shares. */
export const debtsOfGame = (
  shares: readonly OutstandingShare[],
  gameId: number
): Debt[] => shares.filter(s => s.gameId === gameId).map(debtOf);

/** The row of the game table this share belongs to: its beneficiary's. */
export const rowOf = (s: OutstandingShare): GameRow => {
  const key =
    s.beneficiaryId !== null
      ? { playerId: s.beneficiaryId }
      : { hostPlayerId: s.holderId, ordinal: s.guestOrdinal! };
  return {
    key,
    id: keyOf(key),
    name: s.beneficiaryName ?? '+1',
    playerId: s.beneficiaryId,
    hostPlayerId: s.beneficiaryId === null ? s.holderId : null,
    position: null,
    arrival: null,
    points: null,
    inLine: true,
    labels: [],
    played: true,
    team: null,
    owedCents: s.amountCents,
    sub: false,
  };
};

/** Every name a payment cell may need. */
export const namesOf = (
  shares: readonly OutstandingShare[]
): Map<number, string> => {
  const names = new Map<number, string>();
  for (const s of shares) {
    names.set(s.holderId, s.holderName);
    if (s.beneficiaryId !== null && s.beneficiaryName)
      names.set(s.beneficiaryId, s.beneficiaryName);
  }
  return names;
};
