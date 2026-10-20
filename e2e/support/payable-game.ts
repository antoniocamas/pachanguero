import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

/** What a Bizum journey needs in place through the API: players who played and owe their shares. */
export class PayableGame {
  constructor(private readonly request: APIRequestContext) {}

  private async send(method: 'post' | 'put', path: string, data?: unknown) {
    const res = await this.request[method](`/api${path}`, { data });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
    return res.json();
  }

  /** Today's season, created when no spec has yet. */
  async season() {
    const current = await (
      await this.request.get('/api/seasons/current')
    ).json();
    if (current) return current;
    const now = new Date();
    const start =
      now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return this.send('post', '/seasons', { name: `${start}/${start + 1}` });
  }

  /** A played game on the 27th of September of the season, with these players, each owing a share. */
  async played(names: string[]): Promise<{ gameId: number }> {
    const season = await this.season();
    for (const [i, name] of names.entries()) {
      await this.send('post', `/seasons/${season.id}/players`, {
        name,
        seasons: i + 1,
      });
    }
    const game = await this.send('post', '/games', {
      played_on: `${Number(season.name.slice(0, 4))}-09-27`,
    });
    await this.send('put', `/games/${game.id}/candidates`, {
      lines: names.map(text => ({ text })),
    });
    await this.send('post', `/games/${game.id}/convocatoria`, {});
    await this.send('post', `/games/${game.id}/convocatoria/confirm`);
    await this.send('post', `/games/${game.id}/state`, { action: 'play' });
    return { gameId: game.id };
  }
}
