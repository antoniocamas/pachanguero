import type { Contact } from '../api';

/** What the form holds: always text, an empty one meaning "no value". */
export interface ContactDraft {
  email: string;
  phone: string;
}

export const draftOf = (contact: Contact): ContactDraft => ({
  email: contact.email ?? '',
  phone: contact.phone ?? '',
});

/** Only the fields that differ from what is stored, so a save never touches the others. */
export const contactPatch = (
  stored: Contact,
  draft: ContactDraft
): Partial<Contact> => {
  const patch: Partial<Contact> = {};
  if (draft.email.trim() !== (stored.email ?? ''))
    patch.email = draft.email.trim();
  if (draft.phone.trim() !== (stored.phone ?? ''))
    patch.phone = draft.phone.trim();
  return patch;
};

export interface ContactIssue {
  field: 'email' | 'phone' | null;
  /** Under the field it names, when it names one. */
  text: string;
}

/** Reads the server's refusal: which field it names and what to say next to it. */
export const contactIssue = (message: string): ContactIssue => {
  if (message.startsWith('email'))
    return { field: 'email', text: 'Correo electrónico no válido' };
  if (message.startsWith('teléfono'))
    return { field: 'phone', text: 'Teléfono no válido (9 a 15 cifras)' };
  return { field: null, text: message };
};
