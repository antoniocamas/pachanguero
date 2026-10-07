import type { GameState } from '../api';

export interface NextActions {
  create: () => void;
  confirm: () => void;
  play: () => void;
  reopen: () => void;
  uncancel: () => void;
}

/** What to do next in the game's state: the server's label and the buttons that do it. */
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
  const button = (text: string, onClick: () => void, primary = false) => (
    <button
      key={text}
      className={primary ? 'btn primary' : 'btn'}
      disabled={busy}
      onClick={onClick}
    >
      {text}
    </button>
  );

  return (
    <div className="next" data-testid="next-action">
      <span className="txt">
        <b>Siguiente:</b> {label ?? 'nada pendiente'}
      </span>
      {state === 'open' && button('Crear convocatoria', actions.create, true)}
      {state === 'convocatoria_created' && (
        <>
          {button('Crear de nuevo', actions.create)}
          {button('Confirmar convocatoria', actions.confirm, true)}
        </>
      )}
      {state === 'convocatoria_confirmed' && (
        <>
          {button('Crear de nuevo', actions.create)}
          {button('Marcar como jugado', actions.play, true)}
        </>
      )}
      {state === 'played' && button('Reabrir partido', actions.reopen)}
      {state === 'cancelled' &&
        button('Deshacer cancelación', actions.uncancel, true)}
    </div>
  );
}
