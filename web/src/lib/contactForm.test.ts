import { describe, expect, it } from 'vitest';
import {
  contactIssue,
  contactPatch,
  draftOf,
  withEmailAdded,
  withEmailRemoved,
} from './contactForm';

describe('contact form', () => {
  const stored = { emails: ['carlos@example.com'], phone: null };

  it('turns nulls into empty fields, and always offers one email field', () => {
    expect(draftOf(stored)).toEqual({
      emails: ['carlos@example.com'],
      phone: '',
    });
    expect(draftOf({ emails: [], phone: null })).toEqual({
      emails: [''],
      phone: '',
    });
  });

  it('sends only the fields that changed', () => {
    expect(
      contactPatch(stored, {
        emails: ['carlos@example.com', ''],
        phone: ' 600123456 ',
      })
    ).toEqual({ phone: '600123456' });
    expect(contactPatch(stored, draftOf(stored))).toEqual({});
  });

  it('sends the whole list of emails when one is added, changed or cleared', () => {
    expect(
      contactPatch(stored, {
        emails: ['carlos@example.com', ' c@trabajo.es '],
        phone: '',
      })
    ).toEqual({ emails: ['carlos@example.com', 'c@trabajo.es'] });
    expect(contactPatch(stored, { emails: ['  '], phone: '' })).toEqual({
      emails: [],
    });
  });

  it('adds and removes email fields, never leaving none', () => {
    const two = withEmailAdded(draftOf(stored));
    expect(two.emails).toEqual(['carlos@example.com', '']);
    expect(withEmailRemoved(two, 0).emails).toEqual(['']);
    expect(withEmailRemoved(withEmailRemoved(two, 1), 0).emails).toEqual(['']);
  });

  it('puts the server refusal next to the field it names', () => {
    expect(contactIssue('email no válido')).toEqual({
      field: 'email',
      text: 'Correo electrónico no válido',
    });
    expect(contactIssue('email: como mucho 5 correos').text).toBe(
      'Como mucho 5 correos'
    );
    expect(contactIssue('teléfono no válido').field).toBe('phone');
    expect(contactIssue('campo no permitido: name')).toEqual({
      field: null,
      text: 'campo no permitido: name',
    });
  });
});
