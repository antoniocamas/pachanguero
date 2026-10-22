import type { Contact } from '../api';

/** What the form holds: always text, an empty one meaning "no value"; one field per email. */
export interface ContactDraft {
  emails: string[];
  phone: string;
}

/** At least one email field, so there is always somewhere to type the first. */
export const draftOf = (contact: Contact): ContactDraft => ({
  emails: contact.emails.length ? [...contact.emails] : [''],
  phone: contact.phone ?? '',
});

const cleanEmails = (emails: readonly string[]): string[] =>
  emails.map(e => e.trim()).filter(e => e !== '');

/** Only the fields that differ from what is stored, so a save never touches the others. */
export const contactPatch = (
  stored: Contact,
  draft: ContactDraft
): Partial<Contact> => {
  const patch: Partial<Contact> = {};
  const emails = cleanEmails(draft.emails);
  if (JSON.stringify(emails) !== JSON.stringify(stored.emails))
    patch.emails = emails;
  if (draft.phone.trim() !== (stored.phone ?? ''))
    patch.phone = draft.phone.trim();
  return patch;
};

/** The draft with one more empty email field, or one taken out. */
export const withEmailAdded = (draft: ContactDraft): ContactDraft => ({
  ...draft,
  emails: [...draft.emails, ''],
});

export const withEmailRemoved = (
  draft: ContactDraft,
  index: number
): ContactDraft => {
  const emails = draft.emails.filter((_, i) => i !== index);
  return { ...draft, emails: emails.length ? emails : [''] };
};

export interface ContactIssue {
  field: 'email' | 'phone' | null;
  /** Under the field it names, when it names one. */
  text: string;
}

/** Reads the server's refusal: which field it names and what to say next to it. */
export const contactIssue = (message: string): ContactIssue => {
  if (message.startsWith('email: como mucho'))
    return { field: 'email', text: 'Como mucho 5 correos' };
  if (message.startsWith('email'))
    return { field: 'email', text: 'Correo electrónico no válido' };
  if (message.startsWith('teléfono'))
    return { field: 'phone', text: 'Teléfono no válido (9 a 15 cifras)' };
  return { field: null, text: message };
};
