import type { GameState } from '../api';

const STEPS: Array<{ state: Exclude<GameState, 'cancelled'>; label: string }> =
  [
    { state: 'open', label: 'Abierto' },
    { state: 'convocatoria_created', label: 'Convocatoria creada' },
    { state: 'convocatoria_confirmed', label: 'Convocatoria confirmada' },
    { state: 'played', label: 'Jugado' },
  ];

/** Where the game is on its way from sign-ups to played, or that it was cancelled. */
export function StateSteps({ state }: { state: GameState }) {
  if (state === 'cancelled')
    return (
      <div className="steps">
        <span className="step now cancelled" aria-current="step">
          Cancelado
        </span>
      </div>
    );
  const at = STEPS.findIndex(s => s.state === state);
  return (
    <div className="steps">
      {STEPS.map((s, i) => (
        <span
          key={s.state}
          className={`step ${i < at ? 'done' : i === at ? 'now' : ''}`}
          aria-current={i === at ? 'step' : undefined}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}
