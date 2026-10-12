import type Database from 'better-sqlite3';
import type { ContactValidator } from '../domain/contact-validator.js';
import type { Contact, ContactRepository } from './contact-repository.js';

/** Reads and changes a player's own contact data. */
export class ContactService {
  constructor(
    private readonly validator: ContactValidator,
    private readonly contacts: ContactRepository,
    private readonly conn: Database.Database
  ) {}

  get(playerId: number): Contact {
    return this.contacts.get(playerId);
  }

  /** Validates first, then stores in one step; returns what is stored. */
  save(playerId: number, input: unknown): Contact {
    const patch = this.validator.check(input);
    return this.conn.transaction(() => this.contacts.save(playerId, patch))();
  }
}
