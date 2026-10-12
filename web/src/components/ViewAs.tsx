import { useState } from 'react';
import { useKnownPlayers } from '../hooks/useKnownPlayers';
import type { SwitchView } from '../lib/sessionClient';

/** The admin's way to see the app exactly as any player sees it, with or without an account, to troubleshoot. */
export function ViewAs({ onSwitchView }: { onSwitchView: SwitchView }) {
  const players = useKnownPlayers('view-as');
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSwitchView('regular', Number(chosen));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Ver como otro jugador</h2>
      <div className="form">
        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        <select
          aria-label="Jugador"
          value={chosen}
          onChange={e => setChosen(e.target.value)}
        >
          <option value="">Elige un jugador…</option>
          {players.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="btn wide"
          disabled={busy || chosen === ''}
          onClick={() => void go()}
        >
          Ver como este jugador
        </button>
        <p className="muted hint">
          Ves y puedes cambiar lo mismo que el jugador (sus datos de contacto),
          pero no su contraseña. Queda registrado quién ha visto la aplicación
          como quién.
        </p>
      </div>
    </div>
  );
}
