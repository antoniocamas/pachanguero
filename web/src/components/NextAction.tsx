import type { GameState } from '../api';

export interface NextActions {
  create: () => void;
  confirm: () => void;
  play: () => void;
  uncancel: () => void;
}

/** The one button that moves the game forward in each state; played has none. */
const PRIMARY: Partial<
  Record<GameState, { text: string; run: keyof NextActions }>
> = {
  open: { text: 'Crear convocatoria', run: 'create' },
  convocatoria_created: { text: 'Confirmar convocatoria', run: 'confirm' },
  convocatoria_confirmed: { text: 'Marcar como jugado', run: 'play' },
  cancelled: { text: 'Deshacer cancelación', run: 'uncancel' },
};

/**
 * What to do next in the game's state: the server's label and the one button
 * that does it. On a phone the button sits above the bottom menu.
 */
export function NextAction({
  state,
  label,
  busy,
  actions,
}: {
  state: GameState;
  label: string | null;
  busy: boolean;
  actions: NextActions;
}) {
  const primary = PRIMARY[state];
  return (
    <div
      className={`next${primary ? ' has-button' : ''}`}
      data-testid="next-action"
    >
      <span className="txt">
        <b>Siguiente:</b> {label ?? 'nada pendiente'}
      </span>
      {primary && (
        <button
          className="btn primary"
          disabled={busy}
          onClick={actions[primary.run]}
        >
          {primary.text}
        </button>
      )}
    </div>
  );
}
