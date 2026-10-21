import { useState } from 'react';
import type {
  PairResult,
  Pairing,
  Player,
  RestOfBizum,
  WaitingBizum,
} from '../api';
import {
  amountText,
  bookedText,
  identifiedAs,
  reasonLines,
  senderText,
  suggestedPlayer,
  waitingChoices,
  type WaitingChoice,
} from '../lib/waitingBizums';
import { ActionMenu } from './ActionMenu';
import { AssignPlayerDialog } from './AssignPlayerDialog';
import { DismissBizumDialog } from './DismissBizumDialog';
import { PairResultBody } from './PairResultBody';
import { ResolveDialog } from './ResolveDialog';
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
    shares: number,
    rest: RestOfBizum
  ) => Promise<boolean>;
  onDismiss: (bizumId: number) => Promise<boolean>;
  /** The list may have changed: read it again. */
  onClosed: () => void;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [accepted, setAccepted] = useState<PairResult | null>(null);
  const suggested = suggestedPlayer(item);
  const { primary, menu } = waitingChoices(item);
  const who = identifiedAs(item);
  const close = () => {
    setDialog(null);
    setAccepted(null);
    onClosed();
  };
  const label: Record<WaitingChoice, string> = {
    accept: `Sí, es ${suggested?.name ?? ''}`,
    rule: 'Pagar cuotas',
    assign: 'Asignar jugador',
    dismiss: 'Descartar',
  };
  const choose = (choice: WaitingChoice) => {
    if (choice === 'rule') setDialog('rule');
    else if (choice === 'assign') setDialog('assign');
    else if (choice === 'dismiss') setDialog('dismiss');
    else if (suggested !== null)
      void onPair(item.id, suggested.id).then(
        answer => answer && setAccepted(answer)
      );
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
        {primary !== null && (
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => choose(primary)}
          >
            {label[primary]}
          </button>
        )}
        <ActionMenu
          label="Más acciones del Bizum"
          busy={busy}
          onSelect={choose}
          items={menu.map(id => ({
            id,
            label: label[id],
            careful: id === 'dismiss',
          }))}
        />
      </div>
      <ResolveDialog
        open={accepted !== null}
        title="Asignar jugador"
        onClose={close}
      >
        {accepted !== null && (
          <PairResultBody result={accepted} onClose={close} />
        )}
      </ResolveDialog>
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
        onRule={(playerId, shares, rest) => {
          setDialog(null);
          void onRule(item.id, playerId, shares, rest);
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
