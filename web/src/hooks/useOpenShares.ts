import { useCallback } from 'react';
import { api } from '../api';
import { useLoaded } from './useLoaded';

/** The debts this player owes that the Bizum could pay, nearest first; none until a player is chosen. */
export const useOpenShares = (bizumId: number, playerId: number | null) =>
  useLoaded(
    useCallback(
      () =>
        playerId === null
          ? Promise.resolve([])
          : api.openShares(bizumId, playerId),
      [bizumId, playerId]
    )
  );
