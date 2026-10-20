/** What the end date of a bank access means today. */
export class ConnectionClock {
  /** One under the bank's own limit of 180 days. */
  static readonly CONSENT_DAYS = 179;
  /** How long the organiser has to approve at the bank. */
  static readonly PENDING_MINUTES = 15;
  /** From how many days before the end the organiser is warned. */
  static readonly BANNER_DAYS = 14;

  private static readonly DAY_MS = 86_400_000;

  constructor(
    private readonly validUntil: Date,
    private readonly now: Date
  ) {}

  /** Whole days, rounded up, never below zero. */
  daysLeft(): number {
    const left = this.validUntil.getTime() - this.now.getTime();
    return Math.max(0, Math.ceil(left / ConnectionClock.DAY_MS));
  }

  renewSuggested(): boolean {
    return this.daysLeft() <= ConnectionClock.BANNER_DAYS;
  }

  passed(): boolean {
    return this.now.getTime() >= this.validUntil.getTime();
  }
}
