import type { Role, View } from './types.js';

/**
 * What a request is allowed to act as. An admin acts as an admin only while looking at the
 * admin view; looking at the regular view they get exactly what a player gets. A regular user
 * is never anything else, whatever the view in the token says.
 */
export class EffectiveRole {
  constructor(
    private readonly role: Role,
    private readonly view: View
  ) {}

  value(): Role {
    return this.role === 'admin' && this.view === 'admin' ? 'admin' : 'regular';
  }

  isAdmin(): boolean {
    return this.value() === 'admin';
  }

  isRegular(): boolean {
    return this.value() === 'regular';
  }
}
