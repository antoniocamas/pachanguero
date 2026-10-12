import type { Request, Response } from 'express';

const NAME = 'pachanguero_refresh';
const PATH = '/api/auth';

/** Reads and writes the one cookie that carries the refresh token. */
export class CookieJar {
  read(req: Request): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const [name, ...value] = part.trim().split('=');
      if (name === NAME) return value.join('=') || undefined;
    }
    return undefined;
  }

  set(
    res: Response,
    token: string,
    maxAgeSeconds: number,
    secure: boolean
  ): void {
    const flags = `HttpOnly; SameSite=Strict; Path=${PATH}; Max-Age=${maxAgeSeconds}`;
    res.append(
      'Set-Cookie',
      `${NAME}=${token}; ${flags}${secure ? '; Secure' : ''}`
    );
  }

  clear(res: Response): void {
    res.append(
      'Set-Cookie',
      `${NAME}=; HttpOnly; SameSite=Strict; Path=${PATH}; Max-Age=0`
    );
  }
}
