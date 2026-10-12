import { describe, expect, it } from 'vitest';
import { ContactError, ContactValidator } from './contact-validator.js';

describe('ContactValidator', () => {
  const validator = new ContactValidator();

  it('accepts a valid email and phone, trimmed as typed', () => {
    expect(
      validator.check({
        email: '  carlos@example.com ',
        phone: '+34 600 123 456',
      })
    ).toEqual({ email: 'carlos@example.com', phone: '+34 600 123 456' });
  });

  it('leaves a field alone when its key is absent', () => {
    expect(validator.check({ phone: '600123456' })).toEqual({
      phone: '600123456',
    });
  });

  it.each([
    'carlos',
    'carlos@example',
    '@example.com',
    `${'a'.repeat(250)}@b.cd`,
  ])('refuses the email %s naming the field', email => {
    expect(() => validator.check({ email })).toThrow('email no válido');
  });

  it.each(['12345', 'abc', '1234567890123456'])(
    'refuses the phone %s naming the field',
    phone => {
      expect(() => validator.check({ phone })).toThrow('teléfono no válido');
    }
  );

  it.each([{ email: '' }, { email: '   ' }, { email: null }])(
    'reads %j as clearing the email',
    input => {
      expect(validator.check(input)).toEqual({ email: null });
    }
  );

  it('refuses a value that is not text', () => {
    expect(() => validator.check({ phone: 600123456 })).toThrow(ContactError);
  });

  it.each(['name', 'introducedBy', 'games', 'playerId'])(
    'refuses the field %s',
    key => {
      expect(() => validator.check({ email: 'a@b.cd', [key]: 'x' })).toThrow(
        `campo no permitido: ${key}`
      );
    }
  );

  it.each([null, 'text', 7, ['a']])('refuses a body that is %j', input => {
    expect(() => validator.check(input)).toThrow(ContactError);
  });
});
