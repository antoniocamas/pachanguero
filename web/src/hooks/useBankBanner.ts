import { api } from '../api';
import { useLoaded } from './useLoaded';

/** The expiry banner's data, read when the shell opens and after any bank action. */
export const useBankBanner = () => useLoaded(api.bankBanner);
