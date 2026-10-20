import { useCallback } from 'react';
import { api } from '../api';
import { useLoaded } from './useLoaded';

/** What the organiser may know of one payment and the Bizum behind it. */
export const usePaymentDetail = (paymentId: number) =>
  useLoaded(useCallback(() => api.paymentDetail(paymentId), [paymentId]));
