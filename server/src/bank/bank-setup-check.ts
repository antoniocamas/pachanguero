import type { PublicUrl } from '../domain/public-url.js';
import type {
  SetupCheck,
  SetupProblem,
} from '../repo/bank-connection-service.js';
import type { EnableBankingConfig } from './enable-banking-config.js';

/** The settings the bank access needs, as one list of what is missing, by name and never by value. */
export class BankSetupCheck implements SetupCheck {
  private static readonly SETTING: Record<string, string> = {
    app_id_missing: 'ENABLE_BANKING_APP_ID',
    private_key_missing: 'ENABLE_BANKING_PRIVATE_KEY',
    private_key_invalid: 'ENABLE_BANKING_PRIVATE_KEY',
    public_url_missing: 'PACHANGUERO_PUBLIC_URL',
    public_url_invalid: 'PACHANGUERO_PUBLIC_URL',
  };

  constructor(
    private readonly config: EnableBankingConfig,
    private readonly publicUrl: PublicUrl
  ) {}

  problems(): SetupProblem[] {
    return [...this.config.problems(), ...this.publicUrl.problems()].map(
      code => ({ code, setting: BankSetupCheck.SETTING[code] })
    );
  }
}
