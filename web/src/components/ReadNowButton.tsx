import type { ReadNowState } from '../hooks/useReadNow';

/** "Leer ahora": the same button wherever it is offered, with its progress and its answer. */
export function ReadNowButton({
  state,
  onRead,
}: {
  state: ReadNowState;
  onRead: () => void;
}) {
  const reading = state.kind === 'reading';
  return (
    <span className="read-now">
      <button className="btn" disabled={reading} onClick={onRead}>
        {reading ? 'Leyendo…' : 'Leer ahora'}
      </button>
      {state.kind === 'answered' && (
        <span role="status" className="muted">
          {state.text}
        </span>
      )}
    </span>
  );
}
