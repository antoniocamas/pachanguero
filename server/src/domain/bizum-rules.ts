import type { KeywordList } from './keyword-list.js';
import type { MemberKey } from './types.js';

export type SenderIdentity =
  | { kind: 'player'; playerId: number }
  | { kind: 'ambiguous'; playerIds: number[] }
  | { kind: 'unknown'; suggestions: number[] };

/** One debt a Bizum could pay. */
export interface OpenShare {
  debtId: number;
  gameId: number;
  playedOn: string;
  member: MemberKey;
  holderId: number;
  amountCents: number;
}

/** A debt the organiser may choose to pay with a Bizum, and whether its game came after the Bizum. */
export interface RulableShare extends OpenShare {
  afterBooking: boolean;
}

/** Everything the rules need to know about a Bizum, gathered beforehand. */
export interface BizumFacts {
  amountCents: number;
  subject: string | null;
  /** Null when the season containing the booking date does not exist. */
  shareCents: number | null;
  sender: SenderIdentity;
  /** The identified player's, nearest first; empty unless the sender is a player. */
  openShares: OpenShare[];
  include: KeywordList;
  exclude: KeywordList;
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

export type WaitReason =
  | {
      code: 'not_enough_debts';
      playerId: number;
      shares: number;
      debts: number;
    }
  | { code: 'include_word'; word: string; wholeShares: boolean }
  | { code: 'sender_unknown' }
  | { code: 'sender_ambiguous'; playerIds: number[] }
  | { code: 'no_season' }
  | { code: 'kept' }
  | { code: 'amounts_differ' }
  | { code: 'undone' };

export type Verdict =
  | { action: 'discard'; rule: 'R1' | 'R2' | 'R6' }
  | { action: 'settle'; rule: 'R3'; playerId: number; shares: OpenShare[] }
  | {
      action: 'wait';
      rule: 'R4' | 'R5' | 'R7' | null;
      reason: WaitReason;
      sender: SenderIdentity;
    };

/** A new Bizum may be discarded; one already kept never is. */
export type JudgeMode = 'new' | 'review';

/** What the amount makes of the season's share price. */
export class ShareCount {
  readonly whole: boolean;
  readonly shares: number;
  readonly overSeven: boolean;

  constructor(amountCents: number, shareCents: number | null) {
    this.whole = shareCents !== null && amountCents % shareCents === 0;
    this.shares = shareCents === null ? Number.NaN : amountCents / shareCents;
    this.overSeven = shareCents !== null && amountCents > 7 * shareCents;
  }

  /** A whole number of shares a game could hold. */
  get playable(): boolean {
    return this.whole && this.shares >= 1 && this.shares <= 7;
  }
}

export interface BizumRule {
  readonly id: RuleId;
  /** A verdict, or null when the rule does not apply. */
  decide(facts: BizumFacts, count: ShareCount): Verdict | null;
}

/** R1: the subject has a word of the exclusion list. */
export class ExcludeWordRule implements BizumRule {
  readonly id = 'R1';
  decide(facts: BizumFacts): Verdict | null {
    return facts.exclude.find(facts.subject) === null
      ? null
      : { action: 'discard', rule: 'R1' };
  }
}

/** R2: more than seven shares, more than a game can hold. */
export class OverSevenRule implements BizumRule {
  readonly id = 'R2';
  decide(_facts: BizumFacts, count: ShareCount): Verdict | null {
    return count.overSeven ? { action: 'discard', rule: 'R2' } : null;
  }
}

/** R3: a known player paid whole shares and has the debts to cover them. */
export class SettleRule implements BizumRule {
  readonly id = 'R3';
  decide(facts: BizumFacts, count: ShareCount): Verdict | null {
    if (facts.sender.kind !== 'player' || !count.playable) return null;
    if (facts.openShares.length < count.shares) return null;
    return {
      action: 'settle',
      rule: 'R3',
      playerId: facts.sender.playerId,
      shares: facts.openShares.slice(0, count.shares),
    };
  }
}

/** R4: a known player paid whole shares and owes fewer. */
export class NotEnoughDebtsRule implements BizumRule {
  readonly id = 'R4';
  decide(facts: BizumFacts, count: ShareCount): Verdict | null {
    if (facts.sender.kind !== 'player' || !count.playable) return null;
    if (facts.openShares.length >= count.shares) return null;
    return {
      action: 'wait',
      rule: 'R4',
      reason: {
        code: 'not_enough_debts',
        playerId: facts.sender.playerId,
        shares: count.shares,
        debts: facts.openShares.length,
      },
      sender: facts.sender,
    };
  }
}

/** R5: the subject has a word of the inclusion list. */
export class IncludeWordRule implements BizumRule {
  readonly id = 'R5';
  decide(facts: BizumFacts, count: ShareCount): Verdict | null {
    const word = facts.include.find(facts.subject);
    return word === null
      ? null
      : {
          action: 'wait',
          rule: 'R5',
          reason: { code: 'include_word', word, wholeShares: count.whole },
          sender: facts.sender,
        };
  }
}

/** R6: not a whole number of shares. */
export class NotWholeRule implements BizumRule {
  readonly id = 'R6';
  decide(facts: BizumFacts, count: ShareCount): Verdict | null {
    return facts.shareCents !== null && !count.whole
      ? { action: 'discard', rule: 'R6' }
      : null;
  }
}

/** R7: whole shares from a sender who is not a known player. */
export class WholeUnknownRule implements BizumRule {
  readonly id = 'R7';
  decide(facts: BizumFacts, count: ShareCount): Verdict | null {
    const sender = facts.sender;
    if (!count.whole || sender.kind === 'player') return null;
    return {
      action: 'wait',
      rule: 'R7',
      reason:
        sender.kind === 'ambiguous'
          ? { code: 'sender_ambiguous', playerIds: sender.playerIds }
          : { code: 'sender_unknown' },
      sender,
    };
  }
}

/** The rules in order: the first to return a verdict decides. */
export class BizumRuleSet {
  constructor(
    private readonly rules: readonly BizumRule[] = [
      new ExcludeWordRule(),
      new OverSevenRule(),
      new SettleRule(),
      new NotEnoughDebtsRule(),
      new IncludeWordRule(),
      new NotWholeRule(),
      new WholeUnknownRule(),
    ]
  ) {}

  judge(facts: BizumFacts, mode: JudgeMode): Verdict {
    const count = new ShareCount(facts.amountCents, facts.shareCents);
    for (const rule of this.rules) {
      const verdict = rule.decide(facts, count);
      if (verdict === null) continue;
      if (mode === 'review' && verdict.action === 'discard') continue;
      return verdict;
    }
    return {
      action: 'wait',
      rule: null,
      reason: { code: facts.shareCents === null ? 'no_season' : 'kept' },
      sender: facts.sender,
    };
  }
}
