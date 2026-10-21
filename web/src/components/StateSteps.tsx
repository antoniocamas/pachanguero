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
        <div className="bars cancelled" aria-hidden>
          <i className="d" />
          <i className="d" />
          <i className="d" />
          <i className="d" />
        </div>
        <span className="step now cancelled" aria-current="step">
          Cancelado
        </span>
      </div>
    );
  const at = STEPS.findIndex(s => s.state === state);
  return (
    <div className="steps">
      <div className="bars" aria-hidden>
        {STEPS.map((s, i) => (
          <i key={s.state} className={i <= at ? 'd' : ''} />
        ))}
      </div>
      <span className="step now" aria-current="step">
        {STEPS[at].label}
      </span>
    </div>
  );
}
