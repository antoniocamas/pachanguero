import { beforeEach, describe, expect, it } from 'vitest';
import { BankRefusal } from './bank-connection-service.js';
import { BankSettingsRepository } from './bank-settings-repository.js';
import { BankSettingsRig, FourAccounts } from './bank-settings-test-support.js';

describe('BankSettingsService', () => {
  let rig: BankSettingsRig;

  beforeEach(() => {
    rig = new BankSettingsRig();
  });

  const refusal = (action: () => void): string => {
    try {
      action();
    } catch (error) {
      if (error instanceof BankRefusal) return error.message;
      throw error;
    }
    return 'accepted';
  };

  describe('the bank', () => {
    it('is the default of the catalogue when none is stored', () => {
      expect(rig.service.current()?.id).toBe('fake');
    });

    it('is the stored one, once chosen', () => {
      rig.service.update({ bankId: 'fake' });

      expect(rig.service.current()?.id).toBe('fake');
      expect(rig.settings.get().bankId).toBe('fake');
    });

    it('is none when the stored bank is no longer supported', () => {
      rig.settings.ensure();
      rig.conn.prepare(`UPDATE bank_settings SET bank_id = 'gone'`).run();

      expect(rig.service.current()).toBeNull();
    });

    it('is refused when not in the catalogue', () => {
      expect(refusal(() => rig.service.update({ bankId: 'gone' }))).toBe(
        'Banco no disponible'
      );
    });

    it('is refused while a connection is stored', () => {
      rig.connect();

      expect(refusal(() => rig.service.update({ bankId: 'fake' }))).toBe(
        'Desconecta antes de cambiar de banco'
      );
    });
  });

  describe('the currency', () => {
    it('defaults to EUR', () => {
      expect(rig.settings.get().currency).toBe('EUR');
    });

    it('is upper-cased on the way in', () => {
      rig.service.update({ currency: ' usd ' });

      expect(rig.settings.get().currency).toBe('USD');
    });

    it.each(['', 'EU', 'EURO', '12E', 'E R'])('refuses %j', currency => {
      expect(refusal(() => rig.service.update({ currency }))).toBe(
        'Moneda no válida'
      );
    });
  });

  describe('the account', () => {
    it('is accepted when among the connection accounts in the currency', () => {
      rig.connect();

      rig.service.update({ accountStableId: 'eur-2' });

      expect(rig.service.readingAccount()?.stableId).toBe('eur-2');
    });

    it('is refused without a connection', () => {
      expect(
        refusal(() => rig.service.update({ accountStableId: 'eur-1' }))
      ).toBe('Esa cuenta no está entre las de la conexión');
    });

    it('is refused when in another currency', () => {
      rig.connect();

      expect(
        refusal(() => rig.service.update({ accountStableId: 'usd' }))
      ).toBe('Esa cuenta no está entre las de la conexión');
    });

    it('is judged against the currency changed in the same request', () => {
      rig.connect();

      rig.service.update({ currency: 'USD', accountStableId: 'usd' });

      expect(rig.settings.get()).toMatchObject({
        currency: 'USD',
        accountStableId: 'usd',
      });
    });

    it('is kept when the currency changes, and applies again when it matches', () => {
      rig.connect();
      rig.service.update({ accountStableId: 'eur-2' });

      rig.service.update({ currency: 'USD' });
      expect(rig.service.readingAccount()?.stableId).toBe('usd');

      rig.service.update({ currency: 'EUR' });
      expect(rig.service.readingAccount()?.stableId).toBe('eur-2');
    });

    it('is not written when the one account is selected by itself', () => {
      rig.connect();
      rig.service.update({ currency: 'USD' });

      expect(rig.settings.get().accountStableId).toBeNull();
    });

    it('is asked for again when a renewal no longer holds it', () => {
      rig.connect();
      rig.service.update({ accountStableId: 'eur-2' });

      rig.connect([
        ...FourAccounts.ALL.slice(0, 3),
        { ...FourAccounts.ALL[3], stableId: 'eur-3' },
      ]);

      expect(rig.service.readingAccount()).toBeNull();
      expect(rig.service.panelPart().selection.kind).toBe('choose');
    });
  });

  describe('the start date', () => {
    it('is accepted when real and not in the future', () => {
      rig.service.update({ startDate: '2026-09-01' });
      expect(rig.settings.get().startDate).toBe('2026-09-01');

      rig.service.update({ startDate: '2026-10-19' });
      expect(rig.settings.get().startDate).toBe('2026-10-19');
    });

    it.each(['', '01/09/2026', '2026-9-1', '2026-02-30', '2026-13-01', 'hoy'])(
      'refuses %j as not a date',
      startDate => {
        expect(refusal(() => rig.service.update({ startDate }))).toBe(
          'Fecha no válida'
        );
      }
    );

    it('refuses a date in the future', () => {
      expect(
        refusal(() => rig.service.update({ startDate: '2026-10-20' }))
      ).toBe('La fecha no puede ser futura');
    });

    it('may move back and forth', () => {
      rig.service.update({ startDate: '2026-09-01' });
      rig.service.update({ startDate: '2026-08-01' });
      rig.service.update({ startDate: '2026-10-01' });

      expect(rig.settings.get().startDate).toBe('2026-10-01');
    });
  });

  it('changes all of a request or none of it', () => {
    rig.connect();

    expect(
      refusal(() =>
        rig.service.update({ currency: 'USD', startDate: '2099-01-01' })
      )
    ).toBe('La fecha no puede ser futura');

    expect(rig.settings.get().currency).toBe('EUR');
  });

  describe('the words', () => {
    it('start as the four include words and no exclude word', () => {
      expect(rig.keywords.include()).toEqual([
        'pachanga',
        'futbol',
        'fútbol',
        'fubol',
      ]);
      expect(rig.keywords.exclude()).toEqual([]);
    });

    it('are written once, and a removed word does not come back', () => {
      rig.service.replaceWords(['pachanga'], []);

      expect(rig.keywords.include()).toEqual(['pachanga']);
      expect(new BankSettingsRepository(rig.conn).get().currency).toBe('EUR');
      expect(rig.keywords.include()).toEqual(['pachanga']);
    });

    it('are replaced whole in both lists, as typed', () => {
      rig.service.replaceWords(['pachanga', ' Partido '], ['cena']);

      expect(rig.keywords.include()).toEqual(['pachanga', 'Partido']);
      expect(rig.keywords.exclude()).toEqual(['cena']);
    });

    it('may be emptied', () => {
      rig.service.replaceWords([], []);

      expect(rig.keywords.include()).toEqual([]);
    });

    it.each([[''], ['   '], ['x'.repeat(41)]])('refuse %j', word => {
      expect(refusal(() => rig.service.replaceWords([word], []))).toBe(
        'Palabra no válida'
      );
    });

    it('accept a word of exactly 40 characters', () => {
      rig.service.replaceWords(['x'.repeat(40)], []);

      expect(rig.keywords.include()).toHaveLength(1);
    });

    it('refuse a word that folds to another in the same list', () => {
      expect(
        refusal(() => rig.service.replaceWords(['pachanga', 'Pachanga'], []))
      ).toBe('Ya está en la lista');
      expect(
        refusal(() => rig.service.replaceWords([], ['cena', 'CÉNA']))
      ).toBe('Ya está en la lista');
    });

    it('accept the same word in the two lists', () => {
      rig.service.replaceWords(['cena'], ['cena']);

      expect(rig.keywords.exclude()).toEqual(['cena']);
    });

    it('accept futbol and fútbol together, as the initial words are', () => {
      rig.service.replaceWords(['futbol', 'fútbol'], []);

      expect(rig.keywords.include()).toEqual(['futbol', 'fútbol']);
    });

    it('refuse a word entered twice exactly', () => {
      expect(
        refusal(() => rig.service.replaceWords(['futbol', 'futbol'], []))
      ).toBe('Ya está en la lista');
    });

    it('leave the stored lists untouched when refused', () => {
      refusal(() => rig.service.replaceWords(['a', ''], ['b']));

      expect(rig.keywords.include()).toHaveLength(4);
    });
  });

  describe('readiness', () => {
    it('misses the connection and the start date to begin with', () => {
      expect(rig.service.readiness().missing()).toEqual([
        'not_connected',
        'no_start_date',
      ]);
    });

    it('asks to choose between two accounts of the currency', () => {
      rig.connect();
      rig.service.update({ startDate: '2026-09-01' });

      expect(rig.service.readiness().missing()).toEqual(['choose_account']);
    });

    it('is ready once chosen and dated', () => {
      rig.connect();
      rig.service.update({ accountStableId: 'eur-1', startDate: '2026-09-01' });

      expect(rig.service.readiness().ready()).toBe(true);
    });

    it('finds no account in a currency the bank does not hold', () => {
      rig.connect();
      rig.service.update({ currency: 'CHF', startDate: '2026-09-01' });

      expect(rig.service.readiness().missing()).toEqual([
        'no_account_in_currency',
      ]);
    });

    it('needs the connection again once its date has passed', () => {
      rig.connect();
      rig.service.update({ accountStableId: 'eur-1', startDate: '2026-09-01' });

      rig.clock.advance(101 * 86_400_000);

      expect(rig.service.readiness().missing()).toEqual(['reconnect_needed']);
    });

    it('needs the connection again once a read found it ended', () => {
      rig.connect();
      rig.service.update({ accountStableId: 'eur-1', startDate: '2026-09-01' });
      rig.connections.markReconnectNeeded('CLOSED_SESSION');

      expect(rig.service.readiness().missing()).toEqual(['reconnect_needed']);
    });
  });

  describe('the panel part', () => {
    it('says what is set before any connection', () => {
      expect(rig.service.panelPart()).toEqual({
        bank: {
          chosenId: 'fake',
          options: [{ id: 'fake', displayName: 'Banco Ficticio' }],
          editable: true,
        },
        currency: 'EUR',
        accounts: [],
        selection: { kind: 'not_connected', stableId: null },
        startDate: null,
        words: {
          include: ['pachanga', 'futbol', 'fútbol', 'fubol'],
          exclude: [],
        },
        readiness: {
          ready: false,
          missing: ['not_connected', 'no_start_date'],
        },
      });
    });

    it('marks the account read and fixes the bank while connected', () => {
      rig.connect();
      rig.service.update({ accountStableId: 'eur-2' });

      const part = rig.service.panelPart();

      expect(part.bank.editable).toBe(false);
      expect(part.accounts.map(a => [a.stableId, a.chosen])).toEqual([
        ['eur-1', false],
        ['usd', false],
        ['gbp', false],
        ['eur-2', true],
      ]);
      expect(part.selection).toEqual({ kind: 'account', stableId: 'eur-2' });
    });

    it('shows no bank when the stored one is gone', () => {
      rig.settings.ensure();
      rig.conn.prepare(`UPDATE bank_settings SET bank_id = 'gone'`).run();

      expect(rig.service.panelPart().bank.chosenId).toBeNull();
    });
  });
});
