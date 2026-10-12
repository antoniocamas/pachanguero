import { useState, type FormEvent } from 'react';
import { usePasswordChange } from '../hooks/usePasswordChange';

/** Changes the password of whoever is signed in; on success every session ends. */
export function PasswordForm({
  onChanged,
}: {
  onChanged: () => Promise<void>;
}) {
  const { error, rules, busy, change } = usePasswordChange(onChanged);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void change(current, next, confirm);
  };

  return (
    <div className="card">
      <h2>Cambiar contraseña</h2>
      <form className="form" onSubmit={submit}>
        {error && (
          <div className="err" role="alert">
            {error}
            {rules.length > 0 && (
              <ul className="rules">
                {rules.map(rule => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <label className="field">
          <span>Contraseña actual</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Nueva contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={e => setNext(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Repite la nueva contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn primary"
          disabled={busy || !current || !next || !confirm}
        >
          Cambiar contraseña
        </button>
        <p className="muted hint">
          Mínimo 12 caracteres, con mayúscula, minúscula, número y un símbolo.
          Al cambiarla se cierran todas tus sesiones.
        </p>
      </form>
    </div>
  );
}
