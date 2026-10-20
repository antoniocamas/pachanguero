import type { Selection } from './account-selection.js';

export type ReadingMissing =
  | 'not_connected'
  | 'reconnect_needed'
  | 'no_start_date'
  | 'choose_account'
  | 'no_account_in_currency';

export type ConnectionStatus = 'none' | 'connected' | 'reconnect_needed';

/** Whether anything may be read, and if not, what is missing, in the order the panel says it. */
export class ReadingReadiness {
  constructor(
    private readonly connection: ConnectionStatus,
    private readonly selection: Selection,
    private readonly startDate: string | null
  ) {}

  missing(): ReadingMissing[] {
    const missing: ReadingMissing[] = [];
    if (this.connection === 'none') missing.push('not_connected');
    if (this.connection === 'reconnect_needed')
      missing.push('reconnect_needed');
    if (this.startDate === null) missing.push('no_start_date');
    if (this.selection.kind === 'choose') missing.push('choose_account');
    if (this.selection.kind === 'none_in_currency') {
      missing.push('no_account_in_currency');
    }
    return missing;
  }

  ready(): boolean {
    return this.missing().length === 0;
  }
}
