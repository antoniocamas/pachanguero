import { describe, expect, it } from 'vitest';
import { FourAccounts } from '../repo/bank-settings-test-support.js';
import { AccountSelection } from './account-selection.js';

describe('AccountSelection', () => {
  const select = (currency: string, chosen: string | null = null) =>
    new AccountSelection(FourAccounts.ALL, currency, chosen).select();

  it('is not connected without a connection', () => {
    expect(new AccountSelection(null, 'EUR', null).select()).toEqual({
      kind: 'not_connected',
    });
  });

  it('selects the one account in the currency by itself', () => {
    expect(select('USD')).toEqual({
      kind: 'account',
      account: FourAccounts.ALL[1],
    });
  });

  it('asks to choose between two accounts in the currency', () => {
    expect(select('EUR')).toEqual({ kind: 'choose' });
  });

  it('selects the chosen one of several', () => {
    expect(select('EUR', 'eur-2')).toEqual({
      kind: 'account',
      account: FourAccounts.ALL[3],
    });
  });

  it('asks again when the choice is not among those in the currency', () => {
    expect(select('EUR', 'usd')).toEqual({ kind: 'choose' });
    expect(select('EUR', 'gone-after-a-renewal')).toEqual({ kind: 'choose' });
  });

  it('keeps a lone account whatever was chosen', () => {
    expect(select('GBP', 'eur-1').kind).toBe('account');
  });

  it('finds no account in a currency the bank does not hold', () => {
    expect(select('CHF')).toEqual({ kind: 'none_in_currency' });
  });

  it('compares currencies without regard to case', () => {
    expect(select('usd').kind).toBe('account');
  });
});
