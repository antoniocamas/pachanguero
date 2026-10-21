import type { ReadNowState } from '../hooks/useReadNow';
import { ReadNowButton } from './ReadNowButton';

/** Above the views of Deudas whenever the bank can be read: one place to read it now. */
export function BizumsStrip({
  state,
  onRead,
}: {
  state: ReadNowState;
  onRead: () => void;
}) {
  return (
    <div className="bizums-strip">
      <span className="muted">Bizums del banco</span>
      <ReadNowButton state={state} onRead={onRead} />
    </div>
  );
}
