import { api } from '../api';
import { useLoaded } from './useLoaded';

/** The Banco panel, with a way to read it again. */
export const useBankPanel = () => useLoaded(api.bank);
