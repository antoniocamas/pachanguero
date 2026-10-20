import type { PaymentMethod } from '../api';

/** The methods in the order the select offers them; the first is preselected. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'efectivo',
  'bizum',
  'otro',
];

const LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  bizum: 'Bizum',
  otro: 'Otro',
};

/** A method as the organiser reads it; an unknown one is shown as it is. */
export const paymentMethodLabel = (method: string): string =>
  LABELS[method as PaymentMethod] ?? method;
