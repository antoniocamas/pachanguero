/**
 * Five wrong passwords lock an account for fifteen minutes. The count is not cleared when a
 * lock expires: it restarts one short of the limit, so a single further wrong password locks
 * again. Only a correct login, an unlock or a password reset clears it.
 */
export class LockoutPolicy {
  static readonly MAX_ATTEMPTS = 5;
  static readonly LOCK_MINUTES = 15;

  exhausted(failedAttempts: number): boolean {
    return failedAttempts >= LockoutPolicy.MAX_ATTEMPTS;
  }

  lockUntil(now: Date): Date {
    return new Date(now.getTime() + LockoutPolicy.LOCK_MINUTES * 60_000);
  }

  isLocked(lockedUntil: Date | null, now: Date): boolean {
    return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
  }

  /** Whole minutes still to wait, rounded up, at least 1 while locked. */
  minutesLeft(lockedUntil: Date, now: Date): number {
    return Math.max(
      1,
      Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000)
    );
  }

  attemptsAfterExpiry(): number {
    return LockoutPolicy.MAX_ATTEMPTS - 1;
  }
}
