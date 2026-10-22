import { useCallback } from 'react';
import type { Contact } from '../api';
import { useContactSave } from '../hooks/useContactSave';
import { ContactFields } from './ContactFields';

/** The organiser keeps a player's emails and phone, by the same rules as the player's own form. */
export function PlayerContactEditor({
  stored,
  onSave,
}: {
  stored: Contact;
  onSave: (patch: Partial<Contact>) => Promise<void>;
}) {
  const write = useCallback(
    (patch: Partial<Contact>) => onSave(patch),
    [onSave]
  );
  const { issue, saved, busy, save } = useContactSave(write, () => undefined);
  return (
    <ContactFields
      key={`${stored.emails.join(',')}|${stored.phone}`}
      stored={stored}
      issue={issue}
      saved={saved}
      busy={busy}
      onSave={draft => void save(stored, draft)}
      hint="El teléfono también identifica sus Bizums."
    />
  );
}
