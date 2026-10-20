import { useState } from 'react';
import type { PairResult, Pairing, Player, WaitingBizum } from '../api';
import {
  amountText,
  bookedText,
  identifiedAs,
  reasonLines,
  senderText,
  waitingActions,
} from '../lib/waitingBizums';
import { AssignPlayerDialog } from './AssignPlayerDialog';
import { DismissBizumDialog } from './DismissBizumDialog';
import { RuleSharesDialog } from './RuleSharesDialog';

type Dialog = 'assign' | 'rule' | 'dismiss' | null;

/** One waiting Bizum: what the bank said, why it waits, and what the organiser can do. */
export function WaitingBizumItem({
  item,
  players,
  pairings,
  busy,
  onPair,
  onRule,
  onDismiss,
  onClosed,
}: {
  item: WaitingBizum;
  players: Pick<Player, 'id' | 'name'>[];
  pairings: Pairing[];
  busy: boolean;
  onPair: (bizumId: number, playerId: number) => Promise<PairResult | null>;
  onRule: (
    bizumId: number,
    playerId: number,
    shares: number
  ) => Promise<boolean>;
  onDismiss: (bizumId: number) => Promise<boolean>;
  /** The list may have changed: read it again. */
  onClosed: () => void;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const actions = waitingActions(item);
  const who = identifiedAs(item);
  const close = () => {
    setDialog(null);
    onClosed();
  };

  return (
    <div className="waiting-item" data-testid="waiting-bizum">
      <div className="row">
        <span className="name">
          {senderText(item.sender)}
          <small className="muted"> {bookedText(item)}</small>
          {who && <span className="tag holder"> {who}</span>}
        </span>
        <strong>{amountText(item)}</strong>
      </div>
      {reasonLines(item).map(line => (
        <p className="muted reason" key={line}>
          {line}
        </p>
      ))}
      <div className="actions">
        {actions.assign && (
          <button className="btn" onClick={() => setDialog('assign')}>
            Asignar jugador
          </button>
        )}
        {actions.rule && (
          <button className="btn" onClick={() => setDialog('rule')}>
            Pagar cuotas
          </button>
        )}
        <button className="btn" onClick={() => setDialog('dismiss')}>
          Descartar
        </button>
      </div>
      <AssignPlayerDialog
        item={item}
        open={dialog === 'assign'}
        players={players}
        pairings={pairings}
        busy={busy}
        onPair={playerId => onPair(item.id, playerId)}
        onClose={close}
      />
      <RuleSharesDialog
        item={item}
        open={dialog === 'rule'}
        players={players}
        busy={busy}
        onRule={(playerId, shares) => {
          setDialog(null);
          void onRule(item.id, playerId, shares);
        }}
        onClose={() => setDialog(null)}
      />
      <DismissBizumDialog
        item={item}
        open={dialog === 'dismiss'}
        busy={busy}
        onConfirm={() => {
          setDialog(null);
          void onDismiss(item.id);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
