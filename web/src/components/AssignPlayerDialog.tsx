import { useState } from 'react';
import type { PairResult, Pairing, Player, WaitingBizum } from '../api';
import { pairingText } from '../lib/waitingBizums';
import { BizumFacts } from './BizumFacts';
import { PairResultBody } from './PairResultBody';
import { PlayerSelect } from './PlayerSelect';
import { ResolveDialog } from './ResolveDialog';

/**
 * Teaches the system who a sender is. It says what will be saved, and after pairing says what
 * settled; the list is read again only when the organiser closes it, since a Bizum that settled
 * leaves the list and this dialog with it.
 */
export function AssignPlayerDialog({
  item,
  open,
  players,
  pairings,
  busy,
  onPair,
  onClose,
}: {
  item: WaitingBizum;
  open: boolean;
  players: Pick<Player, 'id' | 'name'>[];
  pairings: Pairing[];
  busy: boolean;
  onPair: (playerId: number) => Promise<PairResult | null>;
  onClose: () => void;
}) {
  return (
    <ResolveDialog open={open} title="Asignar jugador" onClose={onClose}>
      <AssignBody
        item={item}
        players={players}
        pairings={pairings}
        busy={busy}
        onPair={onPair}
        onClose={onClose}
      />
    </ResolveDialog>
  );
}

function AssignBody({
  item,
  players,
  pairings,
  busy,
  onPair,
  onClose,
}: Omit<Parameters<typeof AssignPlayerDialog>[0], 'open'>) {
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [result, setResult] = useState<PairResult | null>(null);
  const chosen = players.find(p => p.id === playerId);
  const current = pairings
    .filter(p => p.playerId === playerId)
    .map(p => p.bizumName);

  if (result !== null)
    return <PairResultBody result={result} onClose={onClose} />;
  return (
    <div className="dialog-body">
      <BizumFacts item={item} />
      <PlayerSelect
        item={item}
        players={players}
        value={playerId}
        label="¿Quién es este remitente?"
        onChange={setPlayerId}
      />
      {chosen && (
        <p className="muted">{pairingText(item, chosen.name, current)}</p>
      )}
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy || playerId === null}
          onClick={() => {
            if (playerId === null) return;
            void onPair(playerId).then(answer => answer && setResult(answer));
          }}
        >
          Emparejar
        </button>
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
