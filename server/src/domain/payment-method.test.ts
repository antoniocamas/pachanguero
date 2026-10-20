import { describe, expect, it } from 'vitest';
import { PaymentMethods } from './payment-method.js';

describe('PaymentMethods', () => {
  const methods = new PaymentMethods();

  it.each(['efectivo', 'bizum', 'otro'])('parses %s', value => {
    expect(methods.parse(value)).toBe(value);
  });

  it.each(['cash', 'Efectivo', '', undefined, 3])('refuses %s', value => {
    expect(() => methods.parse(value)).toThrow('Método de pago desconocido');
  });
});
