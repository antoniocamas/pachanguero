import { useState, type ReactNode } from 'react';

/** Asks how many seasons a first-time player has behind them, with a suggestion. */
export function SeniorityPrompt({
  name,
  suggested,
  busy,
  onConfirm,
  extra,
}: {
  name: string;
  suggested: number;
  busy: boolean;
  onConfirm: (seasons: number) => void;
  /** Further actions for the same player, shown beside the confirm button. */
  extra?: ReactNode;
}) {
  const [seasons, setSeasons] = useState(suggested);
  return (
    <div className="actions" data-testid="seniority-prompt">
      <span className="muted">Primera vez este año: temporadas de {name}</span>
      <input
        type="number"
        min={0}
        aria-label={`Temporadas de ${name}`}
        value={seasons}
        onChange={e => setSeasons(Number(e.target.value))}
      />
      <button
        className="btn"
        disabled={busy || seasons < 0}
        onClick={() => onConfirm(seasons)}
      >
        Confirmar antigüedad
      </button>
      {extra}
    </div>
  );
}
