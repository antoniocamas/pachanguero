import { useCallback, useState } from 'react';
import { useBankActions } from '../hooks/useBankActions';
import { useBankPanel } from '../hooks/useBankPanel';
import { useBizumPairings } from '../hooks/useBizumPairings';
import { useKnownPlayers } from '../hooks/useKnownPlayers';
import { useReadNow } from '../hooks/useReadNow';
import { callbackMessage } from '../lib/bankMessages';
import { bankName } from '../lib/bankPanel';
import { BankAccountChoice } from './BankAccountChoice';
import { BankConnectionCard } from './BankConnectionCard';
import { BankReadingSettings } from './BankReadingSettings';
import { BizumPairingsList } from './BizumPairingsList';
import { KeywordLists } from './KeywordLists';

/**
 * Ajustes › Banco: the connection, the account, what is read and the words that decide a Bizum.
 * `returned` is what the bank's redirect left in the address; `onChanged` tells the shell the
 * connection may have changed, so its banner reads again.
 */
export function BankPanel({
  returned,
  onChanged,
}: {
  returned: string | null;
  onChanged: () => void;
}) {
  const { data: panel, error, reload } = useBankPanel();
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    await reload();
    onChanged();
  }, [reload, onChanged]);
  const actions = useBankActions(refresh, setProblem);
  const read = useReadNow(refresh);
  const pairings = useBizumPairings(setProblem);
  const players = useKnownPlayers(null);

  if (panel === null) {
    return error === null ? null : <div className="err">{error}</div>;
  }
  const message =
    returned === null
      ? null
      : callbackMessage(
          returned,
          bankName(panel) ?? 'el banco',
          panel.connection?.validUntil ?? null
        );

  return (
    <>
      {(problem ?? error) && <div className="err">{problem ?? error}</div>}
      {message && (
        <div
          className={message.tone === 'ok' ? 'note ok' : 'err'}
          role="status"
          data-testid="bank-return"
        >
          {message.text}
        </div>
      )}
      <BankConnectionCard
        panel={panel}
        busy={actions.busy}
        read={read.state}
        onRead={() => void read.read()}
        onConnect={() => void actions.connect()}
        onDisconnect={() => void actions.disconnect()}
      />
      <BankAccountChoice
        panel={panel}
        busy={actions.busy}
        onChoose={stableId =>
          void actions.change({ accountStableId: stableId })
        }
      />
      <BankReadingSettings
        key={`${panel.startDate}-${panel.currency}`}
        panel={panel}
        busy={actions.busy}
        onChange={change => void actions.change(change)}
      />
      <KeywordLists
        include={panel.words.include}
        exclude={panel.words.exclude}
        busy={actions.busy}
        onChange={(include, exclude) => void actions.words(include, exclude)}
      />
      <BizumPairingsList
        pairings={pairings.pairings}
        players={players}
        busy={pairings.busy}
        onSet={(id, name) => void pairings.set(id, name)}
        onClear={(id, name) => void pairings.clear(id, name)}
      />
    </>
  );
}
