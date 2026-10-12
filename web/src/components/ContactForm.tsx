import { useState, type FormEvent } from 'react';
import type { Contact } from '../api';
import { useContact } from '../hooks/useContact';
import {
  draftOf,
  type ContactDraft,
  type ContactIssue,
} from '../lib/contactForm';

function ContactFields({
  stored,
  issue,
  saved,
  busy,
  onSave,
}: {
  stored: Contact;
  issue: ContactIssue | null;
  saved: boolean;
  busy: boolean;
  onSave: (draft: ContactDraft) => void;
}) {
  const [draft, setDraft] = useState(draftOf(stored));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(draft);
  };
  const flagged = (field: 'email' | 'phone') => issue?.field === field;

  return (
    <form className="form" onSubmit={submit}>
      {issue && (
        <div className="err" role="alert">
          No se ha guardado: {issue.text.toLowerCase()}.
        </div>
      )}
      {saved && !issue && <div className="ok">Datos guardados.</div>}
      <label className="field">
        <span>Correo electrónico</span>
        <input
          type="email"
          autoComplete="email"
          className={flagged('email') ? 'invalid' : undefined}
          value={draft.email}
          onChange={e => setDraft({ ...draft, email: e.target.value })}
        />
        {flagged('email') && <small>{issue!.text}</small>}
      </label>
      <label className="field">
        <span>Teléfono</span>
        <input
          type="tel"
          autoComplete="tel"
          className={flagged('phone') ? 'invalid' : undefined}
          value={draft.phone}
          onChange={e => setDraft({ ...draft, phone: e.target.value })}
        />
        {flagged('phone') && <small>{issue!.text}</small>}
      </label>
      <button type="submit" className="btn primary" disabled={busy}>
        Guardar
      </button>
      <p className="muted hint">
        Solo datos de contacto: la aplicación no envía nada a este correo ni a
        este teléfono. Puedes dejarlos vacíos.
      </p>
    </form>
  );
}

/** The player's own email and phone: optional, kept as typed once valid. */
export function ContactForm() {
  const { contact, loadError, issue, saved, busy, save } = useContact();

  return (
    <div className="card">
      <h2>Mis datos</h2>
      {loadError && <div className="err">{loadError}</div>}
      {contact && (
        <ContactFields
          key={`${contact.email}|${contact.phone}`}
          stored={contact}
          issue={issue}
          saved={saved}
          busy={busy}
          onSave={draft => void save(draft)}
        />
      )}
    </div>
  );
}
