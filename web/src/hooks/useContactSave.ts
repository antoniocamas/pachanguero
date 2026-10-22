import { useCallback, useState } from 'react';
import type { Contact } from '../api';
import {
  contactIssue,
  contactPatch,
  type ContactDraft,
  type ContactIssue,
} from '../lib/contactForm';

/** Saves what changed in a contact form, through whichever route the screen uses. */
export function useContactSave(
  write: (patch: Partial<Contact>) => Promise<unknown>,
  onSaved: () => Promise<unknown> | void
) {
  const [issue, setIssue] = useState<ContactIssue | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    async (stored: Contact, draft: ContactDraft) => {
      setBusy(true);
      setSaved(false);
      try {
        await write(contactPatch(stored, draft));
        setIssue(null);
        setSaved(true);
        await onSaved();
      } catch (e) {
        setIssue(contactIssue((e as Error).message));
      } finally {
        setBusy(false);
      }
    },
    [write, onSaved]
  );

  return { issue, saved, busy, save };
}
