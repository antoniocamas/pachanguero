import { test, expect } from '@playwright/test';

test('creates the first season and adds a player to the roster', async ({
  page,
}) => {
  await page.goto('/');

  // First run: no seasons exist yet, so the app asks for a name via window.prompt().
  page.once('dialog', dialog => dialog.accept('2025/2026'));
  await page.getByRole('button', { name: 'Crear la primera' }).click();

  await expect(page.getByText('2025/2026')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByPlaceholder('Nombre').fill('Antonio');
  await page.getByRole('button', { name: '+', exact: true }).click();

  await expect(page.getByText('Antonio')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Jugones' })).toContainText(
    '1'
  );
});

// Runs after the test above on purpose: that one needs an empty database, and
// the specs in this directory share a single one.
test('pastes a candidate list and settles an ambiguous name', async ({
  page,
  request,
}) => {
  const post = async (path: string, data: unknown) => {
    const res = await request.post(`/api${path}`, { data });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };

  // The app opens on today's season, so use that one (creating it if the
  // database is empty), and keep the game inside it.
  const now = new Date();
  const startYear =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const existing = await (await request.get('/api/seasons/current')).json();
  const season =
    existing ??
    (await post('/seasons', { name: `${startYear}/${startYear + 1}` }));
  const startYearOfSeason = Number(season.name.slice(0, 4));

  await post(`/seasons/${season.id}/players`, { name: 'Ana', seasons: 1 });
  const juanito = await post(`/seasons/${season.id}/players`, {
    name: 'Juanito',
    seasons: 1,
  });
  const juan = await post(`/seasons/${season.id}/players`, {
    name: 'Juan',
    seasons: 1,
  });
  // 'Juanito' is now both one player's name and another's nickname.
  await post(`/players/${juan.id}/aliases`, { alias: 'Juanito' });
  await post(`/seasons/${season.id}/games`, {
    played_on: `${startYearOfSeason}-11-10`,
  });

  await page.goto('/');

  await page.getByLabel('Lista pegada').fill('1 Ana ⚽\n2 Juanito\n3 Pedro');
  await page.getByRole('button', { name: 'Procesar lista' }).click();

  // The clean line is matched straight away; the other two wait.
  await expect(page.getByTestId('matched-line')).toHaveCount(1);
  await expect(page.getByTestId('matched-line')).toContainText('Ana');
  await expect(page.getByTestId('unresolved-line')).toHaveCount(2);

  // The ambiguous one offers both players to pick from.
  const ambiguous = page
    .getByTestId('unresolved-line')
    .filter({ hasText: 'más de una persona' });
  await expect(ambiguous).toHaveCount(1);
  const picker = ambiguous.getByLabel('Quién es Juanito');
  await expect(picker.locator('option')).toHaveText([
    'Elegir jugador…',
    'Juanito',
    'Juan',
  ]);

  await picker.selectOption({ value: String(juanito.id) });
  await ambiguous.getByRole('button', { name: 'Es este', exact: true }).click();

  // It leaves the unresolved list without re-submitting the paste.
  await expect(page.getByTestId('unresolved-line')).toHaveCount(1);
  await expect(page.getByTestId('matched-line')).toHaveCount(2);
  await expect(page.getByTestId('matched-line').nth(1)).toContainText(
    'Juanito'
  );

  // The unknown name is registered as a new player.
  await page
    .getByTestId('unresolved-line')
    .getByRole('button', { name: 'Registrar nuevo' })
    .click();
  await expect(page.getByTestId('unresolved-line')).toHaveCount(0);
  await expect(page.getByTestId('matched-line')).toHaveCount(3);
});
