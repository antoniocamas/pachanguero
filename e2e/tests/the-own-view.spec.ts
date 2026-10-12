import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { createAccount } from '../support/accounts';
import { test, expect } from './auth.fixture';

// The specs of this directory share one database and `season-and-player` needs it empty at
// its first test, so this one is named to run after the others. It uses the current season
// they leave behind, with its own players, games and accounts.

const PHONE = { width: 375, height: 800 };
const PASSWORD = 'Gol-del-Miercoles7';
const NEW_PASSWORD = 'Penalti-en-Mayo42';

/** What a test needs to have in place through the API before it looks at the screen. */
class Backend {
  constructor(private readonly request: APIRequestContext) {}

  private async send(method: 'post' | 'put', path: string, data?: unknown) {
    const res = await this.request[method](`/api${path}`, { data });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
    return res.json();
  }

  private async season() {
    const current = await (
      await this.request.get('/api/seasons/current')
    ).json();
    if (current) return current;
    const now = new Date();
    const start =
      now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return this.send('post', '/seasons', { name: `${start}/${start + 1}` });
  }

  /** Two players who played together, `owner` having paid one of the two games. */
  async twoGames(owner: string, other: string) {
    const season = await this.season();
    const year = Number(season.name.slice(0, 4));
    const ids: Record<string, number> = {};
    for (const [i, name] of [owner, other].entries()) {
      const p = await this.send('post', `/seasons/${season.id}/players`, {
        name,
        seasons: i + 1,
      });
      ids[name] = p.id;
    }
    const played: number[] = [];
    for (const day of ['28', '29']) {
      const game = await this.send('post', '/games', {
        played_on: `${year}-09-${day}`,
      });
      await this.send('put', `/games/${game.id}/candidates`, {
        lines: [owner, other].map(text => ({ text })),
      });
      await this.send('post', `/games/${game.id}/convocatoria`, {});
      await this.send('post', `/games/${game.id}/convocatoria/confirm`);
      await this.send('post', `/games/${game.id}/state`, { action: 'play' });
      played.push(game.id);
    }
    await this.send('post', `/games/${played[0]}/payments`, {
      shares: [{ playerId: ids[owner] }],
      payerPlayerId: ids[owner],
    });
  }
}

const signIn = async (
  browser: Browser,
  username: string,
  password = PASSWORD
) => {
  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  return page;
};

const tab = (page: Page, name: string) =>
  page.locator('nav.tabs').getByRole('button', { name });

const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth
  );

test.describe('the player own view', () => {
  test('a regular user sees only their own three screens, and no organiser tab', async ({
    browser,
    request,
  }) => {
    await new Backend(request).twoGames('Zowna Dueño', 'Zowna Otro');
    createAccount({
      username: 'e2e-zowna',
      password: PASSWORD,
      role: 'regular',
      player: 'Zowna Dueño',
    });

    const page = await signIn(browser, 'e2e-zowna');

    await expect(tab(page, 'Deudas')).toBeVisible();
    for (const name of ['Pagos', 'Estadísticas', 'Ajustes'])
      await expect(tab(page, name)).toBeVisible();
    for (const name of ['Partido', 'Puntos', 'Jugador'])
      await expect(tab(page, name)).toHaveCount(0);

    await expect(page.getByTestId('own-debts')).toContainText('Debes');
    await expect(page.getByTestId('own-debts')).toContainText('tu parte');
    await tab(page, 'Pagos').click();
    await expect(page.getByTestId('own-payments')).toBeVisible();
    await tab(page, 'Estadísticas').click();
    await expect(page.getByTestId('player-summary')).toContainText(
      'Zowna Dueño'
    );
    await expect(page.getByText('Puesto')).toHaveCount(0);

    await expect(page.locator('body')).not.toContainText('Zowna Otro');
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.context().close();
  });

  test('saves contact data, shows it again after a reload, and says which field is wrong', async ({
    browser,
    request,
  }) => {
    await new Backend(request).twoGames('Zcont Dueño', 'Zcont Otro');
    createAccount({
      username: 'e2e-zcont',
      password: PASSWORD,
      role: 'regular',
      player: 'Zcont Dueño',
    });
    const page = await signIn(browser, 'e2e-zcont');
    await tab(page, 'Ajustes').click();

    await page.getByLabel('Correo electrónico').fill('carlos@example');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('alert')).toContainText('No se ha guardado');
    await expect(
      page.getByText('Correo electrónico no válido', { exact: true })
    ).toBeVisible();

    await page.getByLabel('Correo electrónico').fill('carlos@example.com');
    await page.getByLabel('Teléfono').fill('+34 600 123 456');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Datos guardados.')).toBeVisible();

    await page.reload();
    await tab(page, 'Ajustes').click();
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(
      'carlos@example.com'
    );
    await expect(page.getByLabel('Teléfono')).toHaveValue('+34 600 123 456');
    await page.context().close();
  });

  test('changing the password returns to the login, refuses the old one and lets the new one in', async ({
    browser,
    request,
  }) => {
    await new Backend(request).twoGames('Zclave Dueño', 'Zclave Otro');
    createAccount({
      username: 'e2e-zclave',
      password: PASSWORD,
      role: 'regular',
      player: 'Zclave Dueño',
    });
    const page = await signIn(browser, 'e2e-zclave');
    await tab(page, 'Ajustes').click();

    await page.getByLabel('Contraseña actual').fill('Wrong-Password1!');
    await page.getByLabel('Nueva contraseña', { exact: true }).fill('corta');
    await page.getByLabel('Repite la nueva contraseña').fill('corta');
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByLabel('Contraseña actual').fill(PASSWORD);
    await page
      .getByLabel('Nueva contraseña', { exact: true })
      .fill(NEW_PASSWORD);
    await page.getByLabel('Repite la nueva contraseña').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

    await page.getByLabel('Usuario').fill('e2e-zclave');
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Usuario o contraseña incorrectos.'
    );
    await page.getByLabel('Contraseña').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(tab(page, 'Deudas')).toBeVisible();
    await page.context().close();
  });

  test('an admin who is a player looks at the app as a player, keeps the view over a reload, and goes back', async ({
    browser,
    request,
  }) => {
    await new Backend(request).twoGames('Zjefe Dueño', 'Zjefe Otro');
    createAccount({
      username: 'e2e-zjefe',
      password: PASSWORD,
      role: 'admin',
      player: 'Zjefe Dueño',
    });
    const page = await signIn(browser, 'e2e-zjefe');

    await expect(tab(page, 'Partido')).toBeVisible();
    await tab(page, 'Ajustes').click();
    await page.getByRole('tab', { name: 'Mi cuenta' }).click();
    await page.getByRole('button', { name: 'Ver como jugador' }).click();

    await expect(tab(page, 'Deudas')).toBeVisible();
    await expect(tab(page, 'Partido')).toHaveCount(0);
    await expect(
      page.getByText('Estás viendo la aplicación como jugador.')
    ).toBeVisible();

    await page.reload();
    await expect(tab(page, 'Deudas')).toBeVisible();
    await expect(tab(page, 'Partido')).toHaveCount(0);

    await tab(page, 'Ajustes').click();
    await page.getByRole('button', { name: 'Volver a administrador' }).click();
    await expect(tab(page, 'Partido')).toBeVisible();
    await expect(tab(page, 'Pagos')).toHaveCount(0);
    await page.context().close();
  });

  test('an admin with no player is offered no player view', async ({
    browser,
  }) => {
    createAccount({ username: 'e2e-zsolo', password: PASSWORD, role: 'admin' });
    const page = await signIn(browser, 'e2e-zsolo');

    await tab(page, 'Ajustes').click();
    await page.getByRole('tab', { name: 'Mi cuenta' }).click();

    await expect(page.getByText('no hay vista de jugador')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ver como jugador' })
    ).toHaveCount(0);
    await page.context().close();
  });
});
