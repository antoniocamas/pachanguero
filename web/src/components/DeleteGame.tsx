import { useState } from 'react';
import { api } from '../api';

/** Removes a game with everything recorded on it, after asking. */
export function DeleteGame({
  gameId,
  label,
  onDeleted,
}: {
  gameId: number;
  label: string;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !confirm(
        `¿Borrar el partido del ${label}? Se pierden sus apuntados, la convocatoria, los pagos y las exclusiones.`
      )
    )
      return;
    setBusy(true);
    try {
      await api.deleteGame(gameId);
      setError(null);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: '0 14px 12px' }}>
      {error && <div className="err">{error}</div>}
      <button className="btn wide" disabled={busy} onClick={remove}>
        Borrar este partido
      </button>
    </div>
  );
}
