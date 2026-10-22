import { describe, expect, it } from 'vitest';
import { ContactError, ContactValidator } from './contact-validator.js';

describe('ContactValidator', () => {
  const validator = new ContactValidator();

  it('accepts valid emails and a phone, trimmed as typed', () => {
    expect(
      validator.check({
        emails: ['  carlos@example.com ', 'c@trabajo.example'],
        phone: '+34 600 123 456',
      })
    ).toEqual({
      emails: ['carlos@example.com', 'c@trabajo.example'],
      phone: '+34 600 123 456',
    });
  });

  it('drops blank emails and folds repeated ones, keeping the order', () => {
    expect(
      validator.check({ emails: ['b@x.es', ' ', 'a@x.es', 'b@x.es'] })
    ).toEqual({ emails: ['b@x.es', 'a@x.es'] });
  });

  it('refuses more than five emails, and emails that are not a list', () => {
    expect(() =>
      validator.check({
        emails: ['a', 'b', 'c', 'd', 'e', 'f'].map(n => `${n}@x.es`),
      })
    ).toThrow('como mucho 5');
    expect(() => validator.check({ emails: 'a@x.es' })).toThrow(
      'email no válido'
    );
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
    expect(() => validator.check({ emails: [email] })).toThrow(
      'email no válido'
    );
  });

  it.each(['12345', 'abc', '1234567890123456'])(
    'refuses the phone %s naming the field',
    phone => {
      expect(() => validator.check({ phone })).toThrow('teléfono no válido');
    }
  );

  it.each([{ emails: [] }, { emails: [''] }, { emails: [null] }])(
    'reads %j as clearing the emails',
    input => {
      expect(validator.check(input)).toEqual({ emails: [] });
    }
  );

  it('refuses the old single email field', () => {
    expect(() => validator.check({ email: 'a@b.cd' })).toThrow(
      'campo no permitido: email'
    );
  });

  it('refuses a value that is not text', () => {
    expect(() => validator.check({ phone: 600123456 })).toThrow(ContactError);
  });

  it.each(['name', 'introducedBy', 'games', 'playerId'])(
    'refuses the field %s',
    key => {
      expect(() => validator.check({ emails: ['a@b.cd'], [key]: 'x' })).toThrow(
        `campo no permitido: ${key}`
      );
    }
  );

  it.each([null, 'text', 7, ['a']])('refuses a body that is %j', input => {
    expect(() => validator.check(input)).toThrow(ContactError);
  });
});
