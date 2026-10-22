import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { ContactError, ContactValidator } from '../domain/contact-validator.js';
import { ContactRepository } from './contact-repository.js';
import { ContactService } from './contact-service.js';
import { PlayerRepository } from './player-repository.js';

describe('ContactService', () => {
  let conn: Database.Database;
  let service: ContactService;
  let ana: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    service = new ContactService(
      new ContactValidator(),
      new ContactRepository(conn),
      conn
    );
    ana = new PlayerRepository(conn).register('Ana').id;
  });

  it('stores what is valid and returns what is stored', () => {
    expect(
      service.save(ana, {
        emails: [' ana@example.com '],
        phone: '+34 600 123 456',
      })
    ).toEqual({ emails: ['ana@example.com'], phone: '+34 600 123 456' });
    expect(service.get(ana)).toEqual({
      emails: ['ana@example.com'],
      phone: '+34 600 123 456',
    });
  });

  it('refuses an invalid field and keeps the previous values', () => {
    service.save(ana, { emails: ['ana@example.com'] });

    expect(() =>
      service.save(ana, { emails: ['ana@example.com'], phone: 'abc' })
    ).toThrow(ContactError);
    expect(() =>
      service.save(ana, { emails: ['nope'], phone: '600123456' })
    ).toThrow('email no válido');

    expect(service.get(ana)).toEqual({
      emails: ['ana@example.com'],
      phone: null,
    });
  });

  it('clears a value with an empty text', () => {
    service.save(ana, { emails: ['ana@example.com'], phone: '600123456' });
    expect(service.save(ana, { phone: '' })).toEqual({
      emails: ['ana@example.com'],
      phone: null,
    });
  });
});
