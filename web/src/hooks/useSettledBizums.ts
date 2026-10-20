import { api } from '../api';
import { useLoaded } from './useLoaded';

/** The Bizums already settled, with the debts each one paid. */
export const useSettledBizums = () => useLoaded(api.settledBizums);
