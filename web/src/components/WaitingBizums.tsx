import type {
  Pairing,
  PairResult,
  Player,
  RestOfBizum,
  SharesFor,
  WaitingBizum,
} from '../api';
import { WaitingBizumItem } from './WaitingBizumItem';

/** The Bizums the rules could not settle with certainty, each with what can be done with it. */
export function WaitingBizums({
  waiting,
  players,
  pairings,
  busy,
  error,
  onPair,
  onRule,
  onDismiss,
  onClosed,
}: {
  waiting: WaitingBizum[];
  players: Pick<Player, 'id' | 'name'>[];
  pairings: Pairing[];
  busy: boolean;
  error: string | null;
  onPair: (bizumId: number, playerId: number) => Promise<PairResult | null>;
  onRule: (
    bizumId: number,
    playerId: number,
    shares: number,
    rest: RestOfBizum,
    others: SharesFor[]
  ) => Promise<boolean>;
  onDismiss: (bizumId: number) => Promise<boolean>;
  onClosed: () => void;
}) {
  return (
    <div className="card" data-testid="waiting-bizums">
      {error && <div className="err">{error}</div>}
      {waiting.length === 0 ? (
        <div className="empty">No hay Bizums en espera.</div>
      ) : (
        waiting.map(item => (
          <WaitingBizumItem
            key={item.id}
            item={item}
            players={players}
            pairings={pairings}
            busy={busy}
            onPair={onPair}
            onRule={onRule}
            onDismiss={onDismiss}
            onClosed={onClosed}
          />
        ))
      )}
    </div>
  );
}
