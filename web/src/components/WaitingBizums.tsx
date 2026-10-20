import { useCallback, useState } from 'react';
import { api } from '../api';
import { useKnownPlayers } from '../hooks/useKnownPlayers';
import { useLoaded } from '../hooks/useLoaded';
import { useReadNow } from '../hooks/useReadNow';
import { useWaitingActions } from '../hooks/useWaitingActions';
import { useSettledBizums } from '../hooks/useSettledBizums';
import { useWaitingBizums } from '../hooks/useWaitingBizums';
import { ReadNowButton } from './ReadNowButton';
import { SettledBizums } from './SettledBizums';
import { WaitingBizumItem } from './WaitingBizumItem';

/**
 * The Bizums the rules could not settle with certainty, at the top of Deudas. `canRead` says
 * whether the bank can be read now; `onSettled` reads the debts again, which a Bizum may have paid.
 */
export function WaitingBizums({
  canRead,
  onSettled,
}: {
  canRead: boolean;
  onSettled: () => Promise<void>;
}) {
  const { data, error, reload } = useWaitingBizums();
  const { data: settled, reload: reloadSettled } = useSettledBizums();
  const { data: pairings, reload: reloadPairings } = useLoaded(api.pairings);
  const players = useKnownPlayers(null);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await Promise.all([
      reload(),
      reloadSettled(),
      reloadPairings(),
      onSettled(),
    ]);
  }, [reload, reloadSettled, reloadPairings, onSettled]);
  const actions = useWaitingActions(refresh, setProblem);
  const read = useReadNow(refresh);
  const waiting = data ?? [];

  return (
    <>
      <div className="card" data-testid="waiting-bizums">
        <h2>
          Bizums en espera<span className="count">{waiting.length}</span>
          {canRead && (
            <span className="right">
              <ReadNowButton
                state={read.state}
                onRead={() => void read.read()}
              />
            </span>
          )}
        </h2>
        {(problem ?? error) && <div className="err">{problem ?? error}</div>}
        {waiting.length === 0 ? (
          <div className="empty">No hay Bizums en espera.</div>
        ) : (
          waiting.map(item => (
            <WaitingBizumItem
              key={item.id}
              item={item}
              players={players}
              pairings={pairings ?? []}
              busy={actions.busy}
              onPair={actions.pair}
              onRule={actions.rule}
              onDismiss={actions.dismiss}
              onClosed={() => void refresh()}
            />
          ))
        )}
      </div>
      <SettledBizums settled={settled ?? []} />
    </>
  );
}
