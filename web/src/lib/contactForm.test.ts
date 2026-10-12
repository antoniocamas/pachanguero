import { describe, expect, it } from 'vitest';
import { contactIssue, contactPatch, draftOf } from './contactForm';

describe('contact form', () => {
  const stored = { email: 'carlos@example.com', phone: null };

  it('turns nulls into empty fields', () => {
    expect(draftOf(stored)).toEqual({ email: 'carlos@example.com', phone: '' });
  });

  it('sends only the fields that changed', () => {
    expect(
      contactPatch(stored, {
        email: 'carlos@example.com',
        phone: ' 600123456 ',
      })
    ).toEqual({ phone: '600123456' });
    expect(contactPatch(stored, draftOf(stored))).toEqual({});
  });

  it('sends an empty text to clear a value', () => {
    expect(contactPatch(stored, { email: '  ', phone: '' })).toEqual({
      email: '',
    });
  });

  it('puts the server refusal next to the field it names', () => {
    expect(contactIssue('email no válido')).toEqual({
      field: 'email',
      text: 'Correo electrónico no válido',
    });
    expect(contactIssue('teléfono no válido').field).toBe('phone');
    expect(contactIssue('campo no permitido: name')).toEqual({
      field: null,
      text: 'campo no permitido: name',
    });
  });
});
