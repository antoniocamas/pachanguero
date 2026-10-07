import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

// The specs of this directory share one database and `season-and-player` needs
// it empty at its first test, so this one is named to run after it. It uses
// the current season that spec leaves behind, with its own players and games.

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

let counter = 0;
const letters = (n: number) =>
  Array.from({ length: 3 }, (_, i) =>
    String.fromCharCode(97 + (Math.floor(n / 26 ** i) % 26))
  ).join('');

interface Setup {
  gameId: number;
  names: string[];
  ids: number[];
}

/** The API, for what a test needs to have in place before it looks at the screen. */
class Backend {
  constructor(private readonly request: APIRequestContext) {}

  private async send(
    method: 'post' | 'put' | 'patch',
    path: string,
    data?: unknown
  ) {
    const res = await this.request[method](`/api${path}`, { data });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
    return res.json();
  }

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

  /** A game with `count` players signed up, in arrival order, with distinct seniority. */
  async game(
    count: number,
    lines?: (names: string[]) => string[],
    playedOn?: string
  ): Promise<Setup> {
    const season = await this.season();
    const tag = letters(++counter);
    const names = Array.from(
      { length: count },
      (_, i) => `Zx${tag}${letters(i)}`
    );
    const ids: number[] = [];
    for (const [i, name] of names.entries()) {
      const p = await this.send('post', `/seasons/${season.id}/players`, {
        name,
        seasons: (i % 9) + 1,
      });
      ids.push(p.id);
    }
    const day = String(((counter - 1) % 27) + 1).padStart(2, '0');
    const game = await this.send('post', '/games', {
      played_on: playedOn ?? `${Number(season.name.slice(0, 4))}-09-${day}`,
    });
    await this.send('put', `/games/${game.id}/candidates`, {
      lines: (lines ? lines(names) : names).map(text => ({ text })),
    });
    return { gameId: game.id, names, ids };
  }

  async create(gameId: number) {
    await this.send('post', `/games/${gameId}/convocatoria`, {});
  }

  async confirm(gameId: number) {
    await this.create(gameId);
    await this.send('post', `/games/${gameId}/convocatoria/confirm`);
  }

  async play(gameId: number) {
    await this.confirm(gameId);
    await this.send('post', `/games/${gameId}/state`, { action: 'play' });
  }
}

const openGame = async (page: Page, gameId: number) => {
  await page.goto('/');
  await page.getByLabel('Elegir partido').selectOption(String(gameId));
};

const row = (page: Page, name: string) =>
  page.locator(`[data-testid="player-row"][data-name="${name}"]`);

const stateNow = (page: Page) => page.locator('.step.now');

const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth
  );

const headers = async (page: Page) =>
  (await page.getByRole('columnheader').allInnerTexts())
    .map(t => t.trim())
    .filter(Boolean);

test.describe('the lifecycle, read from the screen', () => {
  test.use({ viewport: DESKTOP });

  test('shows the state and the next action at every step, and undoes a cancellation', async ({
    page,
    request,
  }) => {
    const { gameId } = await new Backend(request).game(4);
    await openGame(page, gameId);
    const next = page.getByTestId('next-action');

    await expect(stateNow(page)).toHaveText('Abierto');
    await expect(next).toContainText('Crear convocatoria');

    await page.getByRole('button', { name: 'Crear convocatoria' }).click();
    await expect(stateNow(page)).toHaveText('Convocatoria creada');
    await expect(next).toContainText('Confirmar convocatoria');

    await page.getByRole('button', { name: 'Confirmar convocatoria' }).click();
    await expect(stateNow(page)).toHaveText('Convocatoria confirmada');
    await expect(next).toContainText('Marcar como jugado');

    await page.getByRole('button', { name: 'Marcar como jugado' }).click();
    await expect(stateNow(page)).toHaveText('Jugado');
    await expect(next).toContainText('Registrar pagos');

    await page.getByRole('button', { name: 'Reabrir partido' }).click();
    await expect(stateNow(page)).toHaveText('Convocatoria confirmada');

    await page.getByRole('button', { name: 'Cancelar partido' }).click();
    await expect(stateNow(page)).toHaveText('Cancelado');
    await expect(next).toContainText('Deshacer cancelación');
    await expect(page.getByTestId('player-row')).toHaveCount(4);

    // Undoing the cancellation returns to the state it was cancelled from.
    await page.getByRole('button', { name: 'Deshacer cancelación' }).click();
    await expect(stateNow(page)).toHaveText('Convocatoria confirmada');
  });

  test('keeps the game on screen when it is only the default and gets played', async ({
    page,
    request,
  }) => {
    // A past game that is the only one waiting, with none upcoming, is the
    // page's default, so nothing is picked in the selector. Other specs leave
    // waiting and upcoming games behind.
    const backend = new Backend(request);
    const season = await backend.season();
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const existing = await (
      await request.get(`/api/seasons/${season.id}/games`)
    ).json();
    for (const g of existing as Array<{
      id: number;
      status: string;
      played_on: string;
    }>)
      if (
        g.played_on >= today ||
        (g.status !== 'played' && g.status !== 'cancelled')
      )
        await request.delete(`/api/games/${g.id}`);
    const lastDay = `${Number(season.name.slice(0, 4))}-09-30`;
    const { gameId } = await backend.game(4, undefined, lastDay);
    await backend.confirm(gameId);
    await page.goto('/');
    await expect(stateNow(page)).toHaveText('Convocatoria confirmada');

    await page.getByRole('button', { name: 'Marcar como jugado' }).click();

    await expect(stateNow(page)).toHaveText('Jugado');
    await expect(page.getByTestId('next-action')).toContainText(
      'Registrar pagos'
    );
    await expect(page.getByLabel('Elegir partido')).toHaveValue(String(gameId));
  });

  test('shows the server refusal beside the bar when a step cannot be taken', async ({
    page,
    request,
  }) => {
    const backend = new Backend(request);
    const { gameId } = await backend.game(2);
    await backend.confirm(gameId);
    await openGame(page, gameId);

    // Played elsewhere meanwhile: the page still offers the old step.
    await request.post(`/api/games/${gameId}/state`, {
      data: { action: 'play' },
    });
    await page.getByRole('button', { name: 'Marcar como jugado' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'El partido ya está jugado'
    );
  });
});

for (const viewport of [
  { name: 'desktop 1280 × 800', size: DESKTOP, phone: false },
  { name: 'phone 390 × 844', size: PHONE, phone: true },
]) {
  test.describe(`the game screen on a ${viewport.name}`, () => {
    test.use({ viewport: viewport.size });

    test('open: arrival order, with arrival, player and points', async ({
      page,
      request,
    }) => {
      const { gameId, names } = await new Backend(request).game(5);
      await openGame(page, gameId);

      await expect(headers(page)).resolves.toEqual(
        viewport.phone ? ['Jugador'] : ['Llegada', 'Jugador', 'Puntos']
      );
      await expect(page.getByTestId('player-row')).toHaveCount(5);
      await expect(page.getByTestId('player-row').first()).toContainText(
        names[0]
      );
      expect(await noHorizontalScroll(page)).toBe(true);
    });

    test('created: the state and next action stay in view while 18 players are scrolled', async ({
      page,
      request,
    }) => {
      const backend = new Backend(request);
      const { gameId, names } = await backend.game(18);
      await backend.create(gameId);
      await openGame(page, gameId);

      const bar = page.getByTestId('game-bar');
      const action = page.getByRole('button', {
        name: 'Confirmar convocatoria',
      });
      await expect(bar).toBeInViewport();
      await expect(action).toBeInViewport();
      await expect(stateNow(page)).toBeInViewport();

      await page.mouse.wheel(0, 300);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(0);
      await expect(action).toBeInViewport();
      await expect(stateNow(page)).toBeInViewport();

      // One table, the line after the 14th row.
      await expect(
        page.getByTestId('zone-in').getByTestId('player-row')
      ).toHaveCount(14);
      await expect(
        page.getByTestId('zone-out').getByTestId('player-row')
      ).toHaveCount(4);
      await expect(headers(page)).resolves.toEqual(
        viewport.phone
          ? ['Orden', 'Jugador']
          : ['Orden', 'Llegada', 'Jugador', 'Puntos']
      );
      expect(await noHorizontalScroll(page)).toBe(true);
      void names;
    });

    test('created: on a phone the narrow columns sit under the name, on a desktop they are columns', async ({
      page,
      request,
    }) => {
      const backend = new Backend(request);
      const { gameId, names } = await backend.game(3);
      await backend.create(gameId);
      await openGame(page, gameId);

      const line = row(page, names[0]).locator('.phone-line');
      if (viewport.phone) await expect(line).toBeVisible();
      else await expect(line).toBeHidden();
    });

    test('keeps every capability of the old screen reachable and shows the four counters', async ({
      page,
      request,
    }) => {
      const backend = new Backend(request);
      const { gameId } = await backend.game(18);
      await backend.create(gameId);
      await openGame(page, gameId);

      await expect(page.getByTestId('counter-apuntados')).toContainText('18');
      await expect(page.getByTestId('counter-plazas')).toContainText('14');
      await expect(page.getByTestId('counter-pagados')).toContainText('0');
      await expect(page.getByTestId('counter-deuda')).toContainText('0 €');

      await page.getByRole('button', { name: '+ Nuevo' }).click();
      await expect(page.getByLabel('Fecha del partido')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Borrar este partido' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Cancelar partido' })
      ).toBeVisible();

      if (viewport.phone)
        await page.getByRole('tab', { name: 'Apuntados' }).click();
      await expect(page.getByLabel('Añadir jugadores')).toBeVisible();
    });

    test('created: a hand swap by button is labelled, and the 15th is refused', async ({
      page,
      request,
    }) => {
      const backend = new Backend(request);
      const { gameId, names } = await backend.game(15);
      await backend.create(gameId);
      await openGame(page, gameId);
      const inLine = page.getByTestId('zone-in');
      const outLine = page.getByTestId('zone-out');

      await expect(outLine.getByTestId('player-row')).toHaveCount(1);
      const out = (await outLine
        .getByTestId('player-row')
        .first()
        .getAttribute('data-name'))!;
      const inside = names.find(n => n !== out)!;

      // Every row's action is a button big enough for a thumb.
      const meter = page.getByRole('button', { name: `Meter a ${out}` });
      const box = (await meter.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(viewport.phone ? 44 : 20);

      await meter.click();
      await expect(page.getByRole('alert')).toContainText('No quedan plazas');
      await expect(inLine.getByTestId('player-row')).toHaveCount(14);

      await page.getByRole('button', { name: `Sacar a ${inside}` }).click();
      await expect(outLine.locator(`[data-name="${inside}"]`)).toContainText(
        'cambiado a mano'
      );
      await page.getByRole('button', { name: `Meter a ${out}` }).click();
      await expect(inLine.locator(`[data-name="${out}"]`)).toContainText(
        'cambiado a mano'
      );
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('played: no horizontal scroll, and the payment action of every row is reachable', async ({
      page,
      request,
    }) => {
      const backend = new Backend(request);
      const { gameId } = await backend.game(14);
      await backend.play(gameId);
      await openGame(page, gameId);

      await expect(stateNow(page)).toHaveText('Jugado');
      await expect(page.getByTestId('player-row')).toHaveCount(14);
      await expect(headers(page)).resolves.toEqual(
        viewport.phone
          ? ['Orden ↕', 'Jugador ↕', 'Jugó ↕', 'Pago ↕']
          : [
              'Orden ↕',
              'Llegada ↕',
              'Jugador ↕',
              'Puntos ↕',
              'Jugó ↕',
              'Equipo ↕',
              'Pago ↕',
            ]
      );
      expect(await noHorizontalScroll(page)).toBe(true);

      const pays = page.getByRole('button', { name: 'Pagar 4 €' });
      await expect(pays).toHaveCount(14);
      for (const pay of await pays.all()) {
        const box = (await pay.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.size.width);
        if (viewport.phone) expect(box.height).toBeGreaterThanOrEqual(44);
      }
    });

    test('cancelled: shows the table it was cancelled from, with nothing to act on', async ({
      page,
      request,
    }) => {
      const backend = new Backend(request);
      const { gameId } = await backend.game(16);
      await backend.create(gameId);
      await request.post(`/api/games/${gameId}/state`, {
        data: { action: 'cancel' },
      });
      await openGame(page, gameId);

      await expect(stateNow(page)).toHaveText('Cancelado');
      await expect(page.getByTestId('player-row')).toHaveCount(16);
      await expect(page.getByRole('button', { name: /^Meter a / })).toHaveCount(
        0
      );
      await expect(page.getByRole('button', { name: /^Sacar a / })).toHaveCount(
        0
      );
    });
  });
}

test.describe('drag across the line, with real mouse events', () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  /** Press on `from`, move to the middle of `to` in steps, release. */
  const drag = async (
    page: Page,
    from: ReturnType<Page['locator']>,
    to: ReturnType<Page['locator']>
  ) => {
    await from.scrollIntoViewIfNeeded();
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, {
      steps: 4,
    });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
    await page.mouse.up();
  };

  test('moves a row above the line and a member below it, labelling both, and refuses the 15th', async ({
    page,
    request,
  }) => {
    const backend = new Backend(request);
    const { gameId, names } = await backend.game(16);
    await backend.create(gameId);
    await openGame(page, gameId);
    const inLine = page.getByTestId('zone-in');
    const outLine = page.getByTestId('zone-out');
    const waiting = (await outLine
      .getByTestId('player-row')
      .first()
      .getAttribute('data-name'))!;
    const member = names.find(
      n => n !== waiting && n !== (null as unknown as string)
    )!;
    const handle = (name: string) => row(page, name).getByTestId('drag-handle');

    // Over the cap: the table stays and the server says why.
    await drag(page, handle(waiting), inLine);
    await expect(page.getByRole('alert')).toContainText('No quedan plazas');
    await expect(inLine.getByTestId('player-row')).toHaveCount(14);

    // A member goes below the line.
    await drag(page, handle(member), outLine);
    await expect(outLine.locator(`[data-name="${member}"]`)).toContainText(
      'cambiado a mano'
    );
    await expect(inLine.getByTestId('player-row')).toHaveCount(13);
    await expect(page.getByTestId('game-bar')).toBeVisible();

    // And the waiting one comes above it.
    await drag(page, handle(waiting), inLine);
    await expect(inLine.locator(`[data-name="${waiting}"]`)).toContainText(
      'cambiado a mano'
    );
    await expect(inLine.getByTestId('player-row')).toHaveCount(14);
    await expect(page.getByRole('alert')).toHaveCount(0);

    // It is stored: still there after a reload.
    await page.reload();
    await page.getByLabel('Elegir partido').selectOption(String(gameId));
    await expect(inLine.locator(`[data-name="${waiting}"]`)).toBeVisible();
  });
});

test.describe('a played game with a host, a plus-one and a named guest', () => {
  test.use({ viewport: DESKTOP });

  /**
   * Ana hosts Marta, who is new and is registered as her guest from the list;
   * Dani brings a plus-one; Luis comes alone.
   */
  const played = async (page: Page, request: APIRequestContext) => {
    const backend = new Backend(request);
    const game = await backend.game(3, () => []);
    const [ana, dani, luis] = game.names;
    const marta = `${ana}m`;
    await openGame(page, game.gameId);
    await page
      .getByLabel('Añadir jugadores')
      .fill(`${ana}\n${marta} (${ana})\n${dani}\n${dani} +1\n${luis}`);
    await page.getByRole('button', { name: 'Añadir a la lista' }).click();
    const unresolved = page.getByTestId('unresolved-line');
    await unresolved.getByLabel('Lo trae').selectOption({ label: ana });
    await unresolved.getByRole('button', { name: 'Registrar nuevo' }).click();
    await page
      .getByTestId('seniority-prompt')
      .getByRole('button', { name: 'Confirmar antigüedad' })
      .click();
    await page.getByRole('button', { name: 'Guardar lista' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await backend.play(game.gameId);
    await page.reload();
    await page.getByLabel('Elegir partido').selectOption(String(game.gameId));
    await expect(stateNow(page)).toHaveText('Jugado');
    return { ...game, ana, marta, dani, luis, plusOne: `Invitado de ${dani}` };
  };

  test('the host pays all, the guest pays their own, the tag shows, the total counts once, and undo restores', async ({
    page,
    request,
  }) => {
    const g = await played(page, request);
    const debt = page.getByTestId('counter-deuda');

    // Five shares of 4 €: the guest's is held by Ana and counted once.
    await expect(debt).toContainText('20 €');
    await expect(
      row(page, g.ana).getByRole('button', { name: 'Pagar 8 €' })
    ).toBeVisible();
    await expect(row(page, g.marta)).toContainText(`Deuda de ${g.ana}`);
    await expect(
      row(page, g.dani).getByRole('button', { name: 'Pagar 8 €' })
    ).toBeVisible();

    // The guest pays their own share: the host's button drops, the total too.
    await row(page, g.marta).getByRole('button', { name: 'Pagar 4 €' }).click();
    await expect(row(page, g.marta)).toContainText('Pagado 4 €');
    await expect(
      row(page, g.ana).getByRole('button', { name: 'Pagar 4 €' })
    ).toBeVisible();
    await expect(debt).toContainText('16 €');
    await expect(page.getByTestId('counter-pagados')).toContainText('1');

    // Undo puts it back as the host's debt.
    await row(page, g.marta).getByRole('button', { name: 'Deshacer' }).click();
    await expect(
      row(page, g.ana).getByRole('button', { name: 'Pagar 8 €' })
    ).toBeVisible();
    await expect(debt).toContainText('20 €');

    // The host pays everything they hold, in one click.
    await row(page, g.ana).getByRole('button', { name: 'Pagar 8 €' }).click();
    await expect(row(page, g.marta)).toContainText(`Pagado 4 € por ${g.ana}`);
    await expect(debt).toContainText('12 €');
  });

  test('an odd amount settles the share, and paying everything leaves nothing to do', async ({
    page,
    request,
  }) => {
    const g = await played(page, request);

    await row(page, g.plusOne)
      .getByRole('button', { name: 'Otro importe…' })
      .click();
    await row(page, g.plusOne).getByLabel('Importe').fill('3,75');
    await row(page, g.plusOne)
      .getByRole('button', { name: 'Pagar este importe' })
      .click();
    await expect(row(page, g.plusOne)).toContainText('Pagado 3,75 €');
    await expect(page.getByTestId('counter-deuda')).toContainText('16 €');

    for (const name of [g.ana, g.dani, g.luis]) {
      const buttons = row(page, name).getByRole('button', {
        name: /^Pagar \d/,
      });
      await buttons.first().click();
    }
    await expect(page.getByTestId('counter-deuda')).toContainText('0 €');
    await expect(page.getByTestId('next-action')).toContainText(
      'nada pendiente'
    );
  });

  test('pasting the teams changes only the team, and an unknown name is settled by choosing a player', async ({
    page,
    request,
  }) => {
    const g = await played(page, request);

    // Payments never ask for teams.
    await expect(
      row(page, g.luis).getByRole('button', { name: 'Pagar 4 €' })
    ).toBeVisible();

    await page
      .getByLabel('Equipos pegados')
      .fill(
        `Claros\n-----\n${g.ana}\n${g.luis}\nOscuros\n-----\n${g.dani}\nNadie Conocido`
      );
    await page.getByRole('button', { name: 'Registrar equipos' }).click();

    await expect(row(page, g.ana)).toContainText('Claros');
    await expect(row(page, g.dani)).toContainText('Oscuros');
    await expect(page.getByTestId('counter-deuda')).toContainText('20 €');

    const unknown = page.getByTestId('unresolved-line');
    await expect(unknown).toHaveCount(1);
    await expect(
      unknown.getByRole('button', { name: 'Registrar nuevo' })
    ).toHaveCount(0);
    await unknown
      .getByLabel('Quién es Nadie Conocido')
      .selectOption({ label: g.marta });
    await unknown.getByRole('button', { name: 'Es este', exact: true }).click();

    await expect(unknown).toHaveCount(0);
    await expect(row(page, g.marta)).toContainText('Oscuros');
  });

  test('sorting by points orders the rows, and sorting again reverses them', async ({
    page,
    request,
  }) => {
    const g = await played(page, request);
    const order = async () =>
      (
        await page
          .getByTestId('player-row')
          .evaluateAll(rows => rows.map(r => r.getAttribute('data-name')))
      ).filter(name => !name!.startsWith('Invitado'));

    await page
      .getByRole('columnheader')
      .getByRole('button', { name: /^Puntos/ })
      .click();
    const first = await order();
    expect(first[0]).toBe(g.luis); // the longest-standing player has the most points

    await page
      .getByRole('columnheader')
      .getByRole('button', { name: /^Puntos/ })
      .click();
    const second = await order();
    expect(second).toEqual([...first].reverse());
  });
});
