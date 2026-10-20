import { beforeEach, describe, expect, it } from 'vitest';
import { BankRefusal } from './bank-connection-service.js';
import { BankSettingsRig } from './bank-settings-test-support.js';

/**
 * The requirements of what is read — account, currency, bank, start date and the two word
 * lists — as Given/When/Then, through the real service on a real database.
 */
describe('the reading settings requirements', () => {
  let rig: BankSettingsRig;

  beforeEach(() => {
    rig = new BankSettingsRig();
  });

  describe('UC-006-01-S6 — The account to read is chosen by a parameter', () => {
    it('stores the connection, reads nothing yet, and asks to choose between the two EUR accounts', () => {
      // Given the bank exposes 4 accounts and the currency to read is EUR (its default)
      expect(rig.settings.get().currency).toBe('EUR');
      // When the connection completes
      rig.connect();
      // Then the panel asks to choose between the two EUR accounts, by currency, type and last 4
      const part = rig.service.panelPart();
      expect(part.selection.kind).toBe('choose');
      expect(rig.service.readingAccount()).toBeNull();
      expect(
        part.accounts
          .filter(account => account.currency === 'EUR')
          .map(({ kind, last4 }) => [kind, last4])
      ).toEqual([
        ['CACC', '1111'],
        ['CACC', '4444'],
      ]);
    });
  });

  describe('UC-006-01-S7 — The choice, outline', () => {
    beforeEach(() => rig.connect());

    it('USD: selects the one USD account by itself', () => {
      rig.service.update({ currency: 'USD' });

      expect(rig.service.readingAccount()?.stableId).toBe('usd');
    });

    it('EUR: asks to choose, and reads once chosen', () => {
      expect(rig.service.panelPart().selection.kind).toBe('choose');

      rig.service.update({ accountStableId: 'eur-2' });

      expect(rig.service.readingAccount()?.stableId).toBe('eur-2');
    });

    it('CHF: says no account was found, and reads nothing', () => {
      rig.service.update({ currency: 'CHF', startDate: '2026-09-01' });

      expect(rig.service.panelPart().selection.kind).toBe('none_in_currency');
      expect(rig.service.readiness().missing()).toContain(
        'no_account_in_currency'
      );
      expect(rig.service.readiness().ready()).toBe(false);
    });

    it('stores the choice by the stable id, which survives a renewal', () => {
      rig.service.update({ accountStableId: 'eur-2' });

      rig.connect();

      expect(rig.settings.get().accountStableId).toBe('eur-2');
      expect(rig.service.readingAccount()?.stableId).toBe('eur-2');
    });
  });

  describe('UC-006-01-S14 — The organiser edits the words that keep or discard a Bizum', () => {
    it('starts with the four include words and no exclude word', () => {
      expect(rig.keywords.include()).toEqual([
        'pachanga',
        'futbol',
        'fútbol',
        'fubol',
      ]);
      expect(rig.keywords.exclude()).toEqual([]);
    });

    it.each([
      ['partido', 'include'],
      ['cena', 'exclude'],
    ] as const)('shows %s in the %s list once added', (word, list) => {
      const include = [...rig.keywords.include()];
      const exclude = [...rig.keywords.exclude()];

      (list === 'include' ? include : exclude).push(word);
      rig.service.replaceWords(include, exclude);

      expect(rig.service.panelPart().words[list]).toContain(word);
    });

    it('lets a word be removed, and it does not come back', () => {
      rig.service.replaceWords(['pachanga', 'futbol', 'fútbol'], []);

      expect(rig.keywords.include()).not.toContain('fubol');
      expect(rig.service.panelPart().words.include).not.toContain('fubol');
    });
  });

  describe('UC-006-01-S15 — The bank is chosen in the panel', () => {
    it('not connected, none chosen yet: the bank is shown, preselected', () => {
      const { bank } = rig.service.panelPart();

      expect(bank.chosenId).toBe('fake');
      expect(bank.editable).toBe(true);
    });

    it('connected: the bank is shown and cannot be edited', () => {
      rig.connect();

      expect(rig.service.panelPart().bank.editable).toBe(false);
      expect(() => rig.service.update({ bankId: 'fake' })).toThrow(BankRefusal);
    });

    it('not connected, the stored bank no longer supported: none is shown and the bank is none', () => {
      rig.settings.ensure();
      rig.conn.prepare(`UPDATE bank_settings SET bank_id = 'gone'`).run();

      expect(rig.service.panelPart().bank.chosenId).toBeNull();
      expect(rig.service.current()).toBeNull();
    });
  });

  describe('UC-006-09-S1 — The organiser sets the start date', () => {
    it('shows the date once set, so only Bizums booked from it are read', () => {
      expect(rig.service.panelPart().startDate).toBeNull();

      rig.service.update({ startDate: '2026-09-01' });

      expect(rig.service.panelPart().startDate).toBe('2026-09-01');
    });
  });

  describe('UC-006-09-S2 — Nothing is read before the setup is complete', () => {
    beforeEach(() => rig.connect());

    it('no start date is set', () => {
      rig.service.update({ accountStableId: 'eur-1' });

      expect(rig.service.readiness().ready()).toBe(false);
      expect(rig.service.panelPart().readiness.missing).toEqual([
        'no_start_date',
      ]);
    });

    it('the account to read is not chosen yet', () => {
      rig.service.update({ startDate: '2026-09-01' });

      expect(rig.service.readiness().ready()).toBe(false);
      expect(rig.service.panelPart().readiness.missing).toEqual([
        'choose_account',
      ]);
    });

    it('reads once both are set', () => {
      rig.service.update({ accountStableId: 'eur-1', startDate: '2026-09-01' });

      expect(rig.service.readiness().ready()).toBe(true);
    });
  });
});
