import type { BizumParty } from '../bizum/model.js';
import { PhoneKey } from './phone-key.js';
import type { SenderIdentity } from './bizum-rules.js';
import type { SenderSuggestion } from './sender-suggestion.js';
import { TextFolding } from './text-folding.js';

/**
 * Who a Bizum's sender is, from what the group has stored and nothing else: a phone sender by
 * phone, a name sender by the Bizum name paired to a player. One never falls back to the
 * other's similarity; a sender that is neither is unknown, with suggestions for the organiser.
 */
export class SenderIdentification {
  private readonly folding = new TextFolding();

  constructor(
    private readonly bizumNames: readonly {
      playerId: number;
      bizumName: string;
    }[],
    private readonly phones: readonly { playerId: number; phone: string }[],
    private readonly suggestion: SenderSuggestion
  ) {}

  identify(sender: BizumParty): SenderIdentity {
    if (sender.phone !== null) {
      const wanted = new PhoneKey(sender.phone);
      const found = this.distinct(
        this.phones
          .filter(entry => new PhoneKey(entry.phone).sameAs(wanted))
          .map(entry => entry.playerId)
      );
      if (found.length > 0) return this.outcome(found);
    }
    if (sender.name !== null) {
      const name = sender.name;
      const found = this.distinct(
        this.bizumNames
          .filter(entry => this.folding.same(entry.bizumName, name))
          .map(entry => entry.playerId)
      );
      if (found.length > 0) return this.outcome(found);
    }
    return {
      kind: 'unknown',
      suggestions: this.suggestion.suggest(sender.name),
    };
  }

  private outcome(playerIds: number[]): SenderIdentity {
    return playerIds.length === 1
      ? { kind: 'player', playerId: playerIds[0] }
      : { kind: 'ambiguous', playerIds };
  }

  private distinct(ids: number[]): number[] {
    return [...new Set(ids)].sort((a, b) => a - b);
  }
}
