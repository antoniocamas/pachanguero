import { api } from '../api';
import { useLoaded } from './useLoaded';

/** The Bizums that wait, with a way to read them again. */
export const useWaitingBizums = () => useLoaded(api.waitingBizums);
