import { createPrivateKey } from 'node:crypto';

export type EnableBankingProblem =
  'app_id_missing' | 'private_key_missing' | 'private_key_invalid';

/**
 * The application's registration at Enable Banking, from the environment. A missing or bad
 * value is reported by name, never thrown: the application starts without a bank and manual
 * payments keep working.
 */
export class EnableBankingConfig {
  static readonly DEFAULT_API_URL = 'https://api.enablebanking.com';

  private constructor(
    readonly appId: string,
    readonly privateKey: string,
    readonly apiUrl: string
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv): EnableBankingConfig {
    return EnableBankingConfig.of({
      appId: env.ENABLE_BANKING_APP_ID,
      privateKey: env.ENABLE_BANKING_PRIVATE_KEY,
      apiUrl: env.ENABLE_BANKING_API_URL,
    });
  }

  static of(values: {
    appId?: string;
    privateKey?: string;
    apiUrl?: string;
  }): EnableBankingConfig {
    const apiUrl = (values.apiUrl ?? '').trim();
    return new EnableBankingConfig(
      (values.appId ?? '').trim(),
      // A key on one line, as an `.env` file holds it, has `\n` for its line breaks.
      (values.privateKey ?? '').replace(/\\n/g, '\n').trim(),
      (apiUrl === '' ? EnableBankingConfig.DEFAULT_API_URL : apiUrl).replace(
        /\/+$/,
        ''
      )
    );
  }

  problems(): EnableBankingProblem[] {
    const found: EnableBankingProblem[] = [];
    if (this.appId === '') found.push('app_id_missing');
    if (this.privateKey === '') found.push('private_key_missing');
    else if (!this.keyIsUsable()) found.push('private_key_invalid');
    return found;
  }

  private keyIsUsable(): boolean {
    if (!this.privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
      return false;
    }
    try {
      return createPrivateKey(this.privateKey).asymmetricKeyType === 'rsa';
    } catch {
      return false;
    }
  }
}
