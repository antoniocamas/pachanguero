import { api } from '../api';
import { useLoaded } from './useLoaded';

/** What the signed-in player owes. */
export const useOwnDebts = () => useLoaded(api.ownDebts);
