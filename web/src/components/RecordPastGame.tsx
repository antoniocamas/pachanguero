import { useState } from 'react';
import { api, type Game } from '../api';

/**
 * Records a game by its date alone. The season is whichever one the date
 * falls in, so a game from an earlier season lands in that season.
 */
export function RecordPastGame({
  onRecorded,
}: {
  onRecorded: (game: Game) => void;
}) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    setBusy(true);
    try {
      const game = await api.createGame(date);
      setDate('');
      setError(null);
      onRecorded(game);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="record-game">
      {error && <div className="err">{error}</div>}
      <div className="actions">
        <input
          type="date"
          aria-label="Fecha del partido"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <button className="btn" disabled={busy || !date} onClick={record}>
          Registrar partido
        </button>
      </div>
    </div>
  );
}
