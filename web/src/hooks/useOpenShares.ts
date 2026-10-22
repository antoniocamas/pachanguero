import { useCallback } from 'react';
import { api } from '../api';
import { useLoaded } from './useLoaded';

/**
 * The debts this player owes that the Bizum could pay, nearest first; none until a player is
 * chosen. `own` keeps only their own shares, the ones someone else may pay for them.
 */
export const useOpenShares = (
  bizumId: number,
  playerId: number | null,
  own = false
) =>
  useLoaded(
    useCallback(
      () =>
        playerId === null
          ? Promise.resolve([])
          : api.openShares(bizumId, playerId, own),
      [bizumId, playerId, own]
    )
  );
