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

  const rows = () =>
    (
      conn.prepare('SELECT COUNT(*) AS n FROM player_contacts').get() as {
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

  it('reads two nulls when the player has no row', () => {
    expect(contacts.get(ana)).toEqual({ email: null, phone: null });
  });

  it('saves and reads back the values, per player', () => {
    contacts.save(ana, { email: 'ana@example.com', phone: '600123456' });

    expect(contacts.get(ana)).toEqual({
      email: 'ana@example.com',
      phone: '600123456',
    });
    expect(contacts.get(luis)).toEqual({ email: null, phone: null });
  });

  it('changes only the fields the patch names', () => {
    contacts.save(ana, { email: 'ana@example.com', phone: '600123456' });

    const stored = contacts.save(ana, { phone: null });

    expect(stored).toEqual({ email: 'ana@example.com', phone: null });
    expect(contacts.get(ana)).toEqual(stored);
  });

  it('removes the row when both values end empty', () => {
    contacts.save(ana, { email: 'ana@example.com' });
    contacts.save(ana, { email: null });

    expect(rows()).toBe(0);
  });

  it('does not create a row for an empty patch', () => {
    contacts.save(ana, {});
    expect(rows()).toBe(0);
  });

  it('lets two players hold the same email', () => {
    contacts.save(ana, { email: 'casa@example.com' });
    contacts.save(luis, { email: 'casa@example.com' });
    expect(rows()).toBe(2);
  });

  it('is removed with the player', () => {
    contacts.save(ana, { email: 'ana@example.com' });
    conn.prepare('DELETE FROM players WHERE id = ?').run(ana);
    expect(rows()).toBe(0);
  });
});
