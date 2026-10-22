import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { ContactRepository } from './contact-repository.js';
import { PlayerRepository } from './player-repository.js';

describe('ContactRepository', () => {
  let conn: Database.Database;
  let contacts: ContactRepository;
  let ana: number;
  let luis: number;

  const count = (table: string) =>
    (
      conn.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
        n: number;
      }
    ).n;

  beforeEach(() => {
    conn = TestDatabase.create();
    contacts = new ContactRepository(conn);
    const players = new PlayerRepository(conn);
    ana = players.register('Ana').id;
    luis = players.register('Luis').id;
  });

  it('reads no emails and no phone when the player has none', () => {
    expect(contacts.get(ana)).toEqual({ emails: [], phone: null });
  });

  it('lists the phones on file with their players, leaving out players with no phone', () => {
    contacts.save(ana, { emails: ['ana@example.com'] });
    contacts.save(luis, { phone: '611 11 11 11' });

    expect(contacts.listPhones()).toEqual([
      { playerId: luis, phone: '611 11 11 11' },
    ]);
  });

  it('saves and reads back the values, per player, the emails in order', () => {
    contacts.save(ana, {
      emails: ['ana@example.com', 'ana@trabajo.example'],
      phone: '600123456',
    });

    expect(contacts.get(ana)).toEqual({
      emails: ['ana@example.com', 'ana@trabajo.example'],
      phone: '600123456',
    });
    expect(contacts.get(luis)).toEqual({ emails: [], phone: null });
  });

  it('changes only the fields the patch names', () => {
    contacts.save(ana, { emails: ['ana@example.com'], phone: '600123456' });

    const stored = contacts.save(ana, { phone: null });

    expect(stored).toEqual({ emails: ['ana@example.com'], phone: null });
    expect(contacts.get(ana)).toEqual(stored);
  });

  it('replaces the whole list of emails, and an empty list clears it', () => {
    contacts.save(ana, { emails: ['a@example.com', 'b@example.com'] });
    contacts.save(ana, { emails: ['b@example.com'] });
    expect(contacts.get(ana).emails).toEqual(['b@example.com']);

    contacts.save(ana, { emails: [] });
    expect(count('player_emails')).toBe(0);
  });

  it('keeps no phone row once the phone is cleared, nor for an empty patch', () => {
    contacts.save(ana, { phone: '600123456' });
    contacts.save(ana, { phone: null });
    contacts.save(luis, {});
    expect(count('player_contacts')).toBe(0);
  });

  it('lets two players hold the same email', () => {
    contacts.save(ana, { emails: ['casa@example.com'] });
    contacts.save(luis, { emails: ['casa@example.com'] });
    expect(count('player_emails')).toBe(2);
  });

  it("lists every player's contact data that has any", () => {
    contacts.save(ana, { emails: ['ana@example.com'] });
    contacts.save(luis, { phone: '600123456' });
    expect(contacts.listAll()).toEqual(
      new Map([
        [ana, { emails: ['ana@example.com'], phone: null }],
        [luis, { emails: [], phone: '600123456' }],
      ])
    );
  });

  it('is removed with the player', () => {
    contacts.save(ana, { emails: ['ana@example.com'], phone: '600123456' });
    conn.prepare('DELETE FROM players WHERE id = ?').run(ana);
    expect(count('player_emails') + count('player_contacts')).toBe(0);
  });
});
