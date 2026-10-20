import type { Bizum } from '../bizum/model.js';
import type { BizumPolicy, Review } from '../bizum/ports.js';
import type { BizumRuleSet } from '../domain/bizum-rules.js';
import type { BizumFactsReader } from './bizum-facts-reader.js';
import type { BizumSettlementService } from './bizum-settlement-service.js';

/** The currency the organiser reads. */
export interface ReadingCurrency {
  currency(): string;
}

/**
 * The application's policy for a new Bizum: an outgoing one, or one in another currency, is
 * discarded; otherwise the rules judge it, and a kept one is settled or left waiting at once,
 * inside the entry's own transaction so it sees what the Bizums before it settled.
 */
export class BizumHandler implements BizumPolicy {
  constructor(
    private readonly facts: BizumFactsReader,
    private readonly rules: BizumRuleSet,
    private readonly settlement: BizumSettlementService,
    private readonly currency: ReadingCurrency
  ) {}

  judge(bizum: Bizum): Review {
    if (
      bizum.direction !== 'incoming' ||
      bizum.currency !== this.currency.currency()
    ) {
      return { kind: 'discard' };
    }
    const verdict = this.rules.judge(this.facts.read(bizum), 'new');
    if (verdict.action === 'discard') return { kind: 'discard' };
    return {
      kind: 'keep',
      afterKept: stored => this.settlement.apply(stored, verdict),
    };
  }
}
