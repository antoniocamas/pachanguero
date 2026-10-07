import type { GameDetail } from '../api';
import { outstandingCents } from './holdings';

export interface Counters {
  apuntados: number;
  plazas: number;
  pagados: number;
  deudaCents: number;
}

/**
 * The four numbers of the bar: who is signed up, the places there are, how
 * many shares are settled and what is still owed.
 */
export const counters = (detail: GameDetail, slots: number): Counters => ({
  apuntados: detail.convocatoria
    ? detail.convocatoria.entries.length
    : detail.arrivals.length,
  plazas: slots,
  pagados: detail.payments.length,
  deudaCents: outstandingCents(detail.debts),
});
