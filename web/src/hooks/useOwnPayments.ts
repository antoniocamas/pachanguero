import { api } from '../api';
import { useLoaded } from './useLoaded';

/** What the signed-in player paid or had paid for them, newest first. */
export const useOwnPayments = () => useLoaded(api.ownPayments);
