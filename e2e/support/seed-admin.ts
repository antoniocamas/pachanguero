import { createAccount } from './accounts';
import { E2E_ADMIN } from './credentials';

/** Creates the end-to-end admin the specs log in as. */
export default function seedAdmin(): void {
  createAccount({ ...E2E_ADMIN, role: 'admin' });
}
