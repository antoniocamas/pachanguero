/** Login names are stored trimmed and lower-case, so `Carlos` and `carlos` are one account. */
export class UsernamePolicy {
  normalise(raw: string): string {
    return raw.trim().toLowerCase();
  }

  /** Expects a normalised name. */
  isValid(username: string): boolean {
    return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username);
  }
}
