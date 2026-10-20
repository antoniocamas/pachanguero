/** The sandbox suite's configuration, read only here and only from the organiser's local `.env`. */
export class SandboxSettings {
  static readonly REQUIRED = [
    'ENABLE_BANKING_SANDBOX_APP_ID',
    'ENABLE_BANKING_SANDBOX_PRIVATE_KEY',
    'ENABLE_BANKING_SANDBOX_SESSION_ID',
    'ENABLE_BANKING_SANDBOX_ACCOUNT_UID',
    'ENABLE_BANKING_SANDBOX_ACCOUNT_HASH',
    'ENABLE_BANKING_SANDBOX_DATE_FROM',
    'ENABLE_BANKING_SANDBOX_EXPECTED_COUNT',
  ] as const;

  private constructor(
    private readonly env: Record<string, string | undefined>
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv): SandboxSettings {
    return new SandboxSettings(env);
  }

  enabled(): boolean {
    return this.env.ENABLE_BANKING_SANDBOX === '1';
  }

  /** The variables the suite needs that are not set. */
  missing(): string[] {
    return SandboxSettings.REQUIRED.filter(name => !this.value(name));
  }

  /** Why the suite is skipped, or null when it is configured to run. */
  skipMessage(): string | null {
    if (!this.enabled()) {
      return 'Sandbox suite skipped: set ENABLE_BANKING_SANDBOX=1 in .env to run it.';
    }
    const missing = this.missing();
    return missing.length === 0
      ? null
      : `Sandbox suite skipped: not set in .env: ${missing.join(', ')}.`;
  }

  get appId(): string {
    return this.value('ENABLE_BANKING_SANDBOX_APP_ID');
  }

  get privateKey(): string {
    return this.value('ENABLE_BANKING_SANDBOX_PRIVATE_KEY');
  }

  get sessionId(): string {
    return this.value('ENABLE_BANKING_SANDBOX_SESSION_ID');
  }

  get accountUid(): string {
    return this.value('ENABLE_BANKING_SANDBOX_ACCOUNT_UID');
  }

  get accountHash(): string {
    return this.value('ENABLE_BANKING_SANDBOX_ACCOUNT_HASH');
  }

  get dateFrom(): string {
    return this.value('ENABLE_BANKING_SANDBOX_DATE_FROM');
  }

  get expectedCount(): number {
    return Number(this.value('ENABLE_BANKING_SANDBOX_EXPECTED_COUNT'));
  }

  private value(name: string): string {
    return (this.env[name] ?? '').trim();
  }
}

/** A guard that fails closed: the suite must never reach the production account. */
export class SandboxGuard {
  constructor(
    private readonly settings: SandboxSettings,
    private readonly production: { appId: string; privateKey: string }
  ) {}

  /** Why the run must not start, or null. Looks at settings only; no network. */
  refusal(): string | null {
    const sandbox = this.settings;
    if (
      this.production.appId !== '' &&
      sandbox.appId === this.production.appId
    ) {
      return 'The sandbox application id is the production one: refusing to run.';
    }
    if (
      this.production.privateKey !== '' &&
      this.normalised(sandbox.privateKey) ===
        this.normalised(this.production.privateKey)
    ) {
      return 'The sandbox key is the production key: refusing to run.';
    }
    if (
      !Number.isInteger(sandbox.expectedCount) ||
      sandbox.expectedCount <= 0
    ) {
      return 'ENABLE_BANKING_SANDBOX_EXPECTED_COUNT must be a positive whole number.';
    }
    return null;
  }

  /** Why the session is not the sandbox's own standing one, or null. */
  sessionRefusal(status: number, body: { status?: unknown }): string | null {
    return status === 200 && body.status === 'AUTHORIZED'
      ? null
      : 'The standing session is not authorised for this application: refusing to run.';
  }

  /** Why the fixture is not the one the suite was written against, or null. */
  fixtureRefusal(counted: number): string | null {
    return counted === this.settings.expectedCount
      ? null
      : `The fixture changed: ${counted} entries, ${this.settings.expectedCount} expected.`;
  }

  private normalised(key: string): string {
    return key.replace(/\\n/g, '\n').trim();
  }
}
