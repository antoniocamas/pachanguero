export type PublicUrlProblem = 'public_url_missing' | 'public_url_invalid';

/**
 * The address the browser reaches the application at, from which the bank's redirect address
 * is made. Absolute `https`, or `http` on this machine for development; no path, query or
 * fragment. A bad value is reported, never thrown: the application starts without it.
 */
export class PublicUrl {
  private readonly origin: string | null;
  private readonly problem: PublicUrlProblem | null;

  private constructor(raw: string | undefined) {
    const text = (raw ?? '').trim();
    if (text === '') {
      this.origin = null;
      this.problem = 'public_url_missing';
      return;
    }
    this.origin = this.parse(text);
    this.problem = this.origin === null ? 'public_url_invalid' : null;
  }

  static fromEnv(env: NodeJS.ProcessEnv): PublicUrl {
    return new PublicUrl(env.PACHANGUERO_PUBLIC_URL);
  }

  static of(value: string | undefined): PublicUrl {
    return new PublicUrl(value);
  }

  problems(): PublicUrlProblem[] {
    return this.problem === null ? [] : [this.problem];
  }

  /** Where the bank sends the browser back to. */
  callbackUrl(): string {
    if (this.origin === null) throw new Error('The public URL is not set');
    return `${this.origin}/api/bank/callback`;
  }

  private parse(text: string): string | null {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const allowed =
      url.protocol === 'https:' || (url.protocol === 'http:' && local);
    const bare = url.pathname === '/' && url.search === '' && url.hash === '';
    const noCredentials = url.username === '' && url.password === '';
    return allowed && bare && noCredentials && !/[?#]/.test(text)
      ? url.origin
      : null;
  }
}
