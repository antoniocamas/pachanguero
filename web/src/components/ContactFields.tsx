import { useState, type FormEvent } from 'react';
import type { Contact } from '../api';
import {
  draftOf,
  withEmailAdded,
  withEmailRemoved,
  type ContactDraft,
  type ContactIssue,
} from '../lib/contactForm';

/** The emails, one field each, and the phone; saved together. Shared by the player and the organiser. */
export function ContactFields({
  stored,
  issue,
  saved,
  busy,
  onSave,
  hint,
}: {
  stored: Contact;
  issue: ContactIssue | null;
  saved: boolean;
  busy: boolean;
  onSave: (draft: ContactDraft) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(draftOf(stored));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(draft);
  };
  const flagged = (field: 'email' | 'phone') => issue?.field === field;
  const setEmail = (index: number, value: string) =>
    setDraft({
      ...draft,
      emails: draft.emails.map((e, i) => (i === index ? value : e)),
    });

  return (
    <form className="form" onSubmit={submit}>
      {issue && (
        <div className="err" role="alert">
          No se ha guardado: {issue.text.toLowerCase()}.
        </div>
      )}
      {saved && !issue && <div className="ok">Datos guardados.</div>}
      <div className="field">
        <span>Correos electrónicos</span>
        {draft.emails.map((email, i) => (
          <div className="email-line" key={i}>
            <input
              type="email"
              autoComplete={i === 0 ? 'email' : 'off'}
              aria-label={`Correo electrónico ${i + 1}`}
              className={flagged('email') ? 'invalid' : undefined}
              value={email}
              onChange={e => setEmail(i, e.target.value)}
            />
            {draft.emails.length > 1 && (
              <button
                type="button"
                className="btn"
                aria-label={`Quitar correo ${i + 1}`}
                onClick={() => setDraft(withEmailRemoved(draft, i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {flagged('email') && <small>{issue!.text}</small>}
        <button
          type="button"
          className="btn link"
          onClick={() => setDraft(withEmailAdded(draft))}
        >
          ＋ Otro correo
        </button>
      </div>
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
      {hint && <p className="muted hint">{hint}</p>}
    </form>
  );
}
