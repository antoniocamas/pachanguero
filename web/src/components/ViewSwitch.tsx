import { useState } from 'react';
import { viewSwitchAction } from '../lib/ownDebts';
import type { SessionUser } from '../lib/sessionClient';

/** The admin's way into the player's view and back; nothing for anyone else. */
export function ViewSwitch({
  user,
  onSwitchView,
}: {
  user: SessionUser;
  onSwitchView: (view: 'admin' | 'regular') => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const action = viewSwitchAction(user);
  if (!action) return null;

  if (action.kind === 'unavailable') {
    return (
      <div className="card">
        <h2>Vista</h2>
        <p className="note">{action.note}</p>
      </div>
    );
  }

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSwitchView(action.to);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Vista</h2>
      <div className="form">
        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        <button className="btn wide" disabled={busy} onClick={() => void go()}>
          {action.label}
        </button>
        {action.hint && <p className="muted hint">{action.hint}</p>}
      </div>
    </div>
  );
}
