import { useState } from 'react';
import { api } from '../api';

/** Today falls in a season nobody has created yet: offer to create it in one tap. */
export function NewSeasonPrompt({
  name,
  onCreated,
}: {
  name: string;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    try {
      await api.createSeason({ name });
      setError(null);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" data-testid="new-season-prompt">
      <h2>Nueva temporada</h2>
      {error && <div className="err">{error}</div>}
      <div className="empty">
        Todavía no existe la temporada {name}.
        <div style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy} onClick={create}>
            Crear la temporada {name}
          </button>
        </div>
      </div>
    </div>
  );
}
