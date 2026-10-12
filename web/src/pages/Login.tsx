import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/sessionClient';

/** The screen anyone sees without a session. The server's own message says what went wrong. */
export function Login({
  onLogin,
  notice,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  notice?: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError((err as Error).message);
      setLocked(err instanceof ApiError && err.status === 423);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login" onSubmit={submit}>
      <h1>
        <span aria-hidden>⚽</span> Pachanguero
      </h1>
      <p className="sub">Entra con tu usuario</p>
      {notice && !error && <div className="ok">{notice}</div>}
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}
      <label className="field">
        <span>Usuario</span>
        <input
          value={username}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          onChange={e => {
            setUsername(e.target.value);
            setLocked(false);
          }}
        />
      </label>
      <label className="field">
        <span>Contraseña</span>
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={e => setPassword(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className="btn primary wide"
        disabled={busy || locked || !username || !password}
      >
        Entrar
      </button>
    </form>
  );
}
