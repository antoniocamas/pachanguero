import { describe, expect, it } from 'vitest';
import { BankCatalogue } from './bank-catalogue.js';
import { FakeBankDialect } from './fake/fake-bank-dialect.js';
import { RevolutDialect } from './revolut-dialect.js';

describe('BankCatalogue', () => {
  const catalogue = new BankCatalogue([
    new RevolutDialect(),
    new FakeBankDialect(),
  ]);

  it('lists the banks in the order given', () => {
    expect(catalogue.list()).toEqual([
      { id: 'revolut', displayName: 'Revolut' },
      { id: 'fake', displayName: 'Banco Ficticio' },
    ]);
  });

  it('defaults to the first', () => {
    expect(catalogue.defaultId()).toBe('revolut');
  });

  it('finds a bank by its id', () => {
    expect(catalogue.find('fake')?.displayName).toBe('Banco Ficticio');
  });

  it('finds nothing for an unknown id', () => {
    expect(catalogue.find('nope')).toBeNull();
  });

  it('refuses to be empty', () => {
    expect(() => new BankCatalogue([])).toThrow();
  });
});
