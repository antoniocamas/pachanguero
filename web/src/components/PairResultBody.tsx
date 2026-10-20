import type { PairResult } from '../api';
import { pairResultLines } from '../lib/waitingBizums';

/** What pairing did, with the button that closes the dialog and reads the list again. */
export function PairResultBody({
  result,
  onClose,
}: {
  result: PairResult;
  onClose: () => void;
}) {
  return (
    <div className="dialog-body" data-testid="pair-result">
      {pairResultLines(result).map(line => (
        <p key={line}>{line}</p>
      ))}
      <div className="actions">
        <button className="btn primary" onClick={onClose}>
          Hecho
        </button>
      </div>
    </div>
  );
}
