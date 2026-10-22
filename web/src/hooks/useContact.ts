import { useCallback } from 'react';
import { api, type Contact } from '../api';
import { useContactSave } from './useContactSave';
import { useLoaded } from './useLoaded';

/** The player's own contact data and the action that saves what changed. */
export function useContact() {
  const { data: contact, error: loadError, reload } = useLoaded(api.contact);
  const write = useCallback(
    (patch: Partial<Contact>) => api.saveContact(patch),
    []
  );
  const { issue, saved, busy, save } = useContactSave(write, reload);
  return { contact, loadError, issue, saved, busy, save };
}
