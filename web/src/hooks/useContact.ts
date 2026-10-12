import { useCallback, useState } from 'react';
import { api } from '../api';
import {
  contactIssue,
  contactPatch,
  type ContactDraft,
  type ContactIssue,
} from '../lib/contactForm';
import { useLoaded } from './useLoaded';

/** The player's own contact data and the action that saves what changed. */
export function useContact() {
  const { data: contact, error: loadError, reload } = useLoaded(api.contact);
  const [issue, setIssue] = useState<ContactIssue | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    async (draft: ContactDraft) => {
      if (!contact) return;
      setBusy(true);
      setSaved(false);
      try {
        await api.saveContact(contactPatch(contact, draft));
        setIssue(null);
        setSaved(true);
        await reload();
      } catch (e) {
        setIssue(contactIssue((e as Error).message));
      } finally {
        setBusy(false);
      }
    },
    [contact, reload]
  );

  return { contact, loadError, issue, saved, busy, save };
}
