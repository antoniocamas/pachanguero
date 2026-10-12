import { api } from '../api';
import { useLoaded } from './useLoaded';

/** The signed-in player's statistics, without any standing. */
export const useOwnReport = () => useLoaded(api.ownReport);
