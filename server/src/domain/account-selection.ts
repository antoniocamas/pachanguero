import type { AccountChoice } from '../bizum/ports.js';

export type Selection =
  | { kind: 'account'; account: AccountChoice }
  | { kind: 'choose' }
  | { kind: 'none_in_currency' }
  | { kind: 'not_connected' };

/**
 * Which account is read: of the connection's accounts, those in the currency; one by itself, or
 * the one the organiser chose among several. A choice that no longer applies never selects a
 * wrong account, it asks again.
 */
export class AccountSelection {
  /** `accounts` is null when there is no connection. */
  constructor(
    private readonly accounts: readonly AccountChoice[] | null,
    private readonly currency: string,
    private readonly chosenStableId: string | null
  ) {}

  select(): Selection {
    if (this.accounts === null) return { kind: 'not_connected' };
    const inCurrency = this.accounts.filter(
      account => account.currency.toUpperCase() === this.currency.toUpperCase()
    );
    if (inCurrency.length === 0) return { kind: 'none_in_currency' };
    if (inCurrency.length === 1)
      return { kind: 'account', account: inCurrency[0] };
    const chosen = inCurrency.find(
      account => account.stableId === this.chosenStableId
    );
    return chosen === undefined
      ? { kind: 'choose' }
      : { kind: 'account', account: chosen };
  }
}
