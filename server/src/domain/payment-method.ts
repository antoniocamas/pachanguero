/** How a payment was made: stored lower-case without accents, shown in Spanish by the web. */
export type PaymentMethod = 'efectivo' | 'bizum' | 'otro';

/** The closed list of payment methods, and the one place that decides what is one. */
export class PaymentMethods {
  private readonly all: readonly PaymentMethod[] = [
    'efectivo',
    'bizum',
    'otro',
  ];

  parse(value: unknown): PaymentMethod {
    const method = this.all.find(candidate => candidate === value);
    if (method === undefined) throw new Error('Método de pago desconocido');
    return method;
  }
}
