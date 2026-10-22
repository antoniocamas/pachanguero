import { useContact } from '../hooks/useContact';
import { ContactFields } from './ContactFields';

/** The player's own emails and phone: optional, kept as typed once valid. */
export function ContactForm() {
  const { contact, loadError, issue, saved, busy, save } = useContact();

  return (
    <div className="card">
      <h2>Mis datos</h2>
      {loadError && <div className="err">{loadError}</div>}
      {contact && (
        <ContactFields
          key={`${contact.emails.join(',')}|${contact.phone}`}
          stored={contact}
          issue={issue}
          saved={saved}
          busy={busy}
          onSave={draft => void save(contact, draft)}
          hint="Solo datos de contacto: la aplicación no envía nada a estos correos ni a este teléfono. Puedes dejarlos vacíos."
        />
      )}
    </div>
  );
}
