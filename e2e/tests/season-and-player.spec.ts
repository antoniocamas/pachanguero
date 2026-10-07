import { test, expect } from '@playwright/test';

test('creates the first season and adds a player to the roster', async ({
  page,
}) => {
  await page.goto('/');

  // First run: no seasons exist yet, so the landing page offers today's season.
  const now = new Date();
  const startYear =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const name = `${startYear}/${startYear + 1}`;
  await expect(page.getByTestId('new-season-prompt')).toContainText(name);
  await page
    .getByRole('button', { name: `Crear la temporada ${name}` })
    .click();

  await expect(page.getByTestId('new-season-prompt')).toHaveCount(0);
  await expect(page.locator('.season')).toHaveText(name);

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
  await post('/games', {
    played_on: `${startYearOfSeason}-11-10`,
  });

  await page.goto('/');

  await page
    .getByLabel('Añadir jugadores')
    .fill('1 Ana ⚽\n2 Juanito\n3 Pedro');
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();

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

test('a pasted list with team headings and separators yields only players', async ({
  page,
  request,
}) => {
  const post = async (path: string, data: unknown) => {
    const res = await request.post(`/api${path}`, { data });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const now = new Date();
  const startYear =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const existing = await (await request.get('/api/seasons/current')).json();
  const season =
    existing ??
    (await post('/seasons', { name: `${startYear}/${startYear + 1}` }));
  await post(`/seasons/${season.id}/players`, { name: 'Tri', seasons: 1 });
  await post(`/seasons/${season.id}/players`, { name: 'Nacho', seasons: 1 });
  await post('/games', {
    played_on: `${Number(season.name.slice(0, 4))}-12-15`,
  });

  await page.goto('/');
  await page
    .getByLabel('Añadir jugadores')
    .fill('Claros\n------------\nTri\n\nOscuros\n---------\nNacho');
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();

  await expect(page.getByTestId('matched-line')).toHaveCount(2);
  await expect(page.getByTestId('unresolved-line')).toHaveCount(0);
});

test('a game can be deleted, and a pasted name can be linked to a player of another season', async ({
  page,
  request,
}) => {
  const post = async (path: string, data: unknown) => {
    const res = await request.post(`/api${path}`, { data });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const existing = await (await request.get('/api/seasons/current')).json();
  const now = new Date();
  const startYear =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const season =
    existing ??
    (await post('/seasons', { name: `${startYear}/${startYear + 1}` }));
  // A veteran enrolled only in an earlier season.
  const earlier = await post('/seasons', { name: '1999/2000' });
  await post(`/seasons/${earlier.id}/players`, {
    name: 'Veterano Lejano',
    seasons: 4,
  });
  const date = `${Number(season.name.slice(0, 4))}-12-22`;
  const game = await post('/games', { played_on: date });

  await page.goto('/');
  await page.getByLabel('Elegir partido').selectOption(String(game.id));
  await page.getByLabel('Añadir jugadores').fill('Desconocida Rara');
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();
  const picker = page.getByLabel('Quién es Desconocida Rara');
  await expect(picker.locator('option')).toContainText([
    'Elegir jugador…',
    'Veterano Lejano',
  ]);

  // The unrecognised name opened a dialog that holds the page until closed.
  await page.getByRole('button', { name: 'Cerrar' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Borrar este partido' }).click();
  await expect(
    page.getByLabel('Elegir partido').locator(`option[value="${game.id}"]`)
  ).toHaveCount(0);
});

test('a hand swap decides who earns the exclusion point when the game is played', async ({
  page,
  request,
}) => {
  const send = async (
    method: 'post' | 'put' | 'patch',
    path: string,
    data?: unknown
  ) => {
    const res = await request[method](`/api${path}`, { data });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };

  const season = await (await request.get('/api/seasons/current')).json();
  const startYear = Number(season.name.slice(0, 4));
  // Two slots, three players: the selection cuts Gc.
  await send('patch', `/seasons/${season.id}`, { slots: 2 });
  const game = await send('post', '/games', {
    played_on: `${startYear}-11-17`,
  });
  for (const name of ['Ga', 'Gb', 'Gc']) {
    const p = await send('post', `/seasons/${season.id}/players`, {
      name,
      seasons: 1,
    });
    await send('put', `/games/${game.id}/players/${p.id}`, { signed_up: true });
  }

  const exclusionsOf = async (name: string) => {
    const table = await (
      await request.get(`/api/seasons/${season.id}/standings`)
    ).json();
    return table.find((r: { name: string }) => r.name === name).exclusions;
  };

  await page.goto('/');
  await page.getByLabel('Elegir partido').selectOption(String(game.id));
  await page.getByRole('button', { name: 'Crear convocatoria' }).click();
  await expect(page.locator('.step.now')).toHaveText('Convocatoria creada');

  // Creating it writes no exclusion: that is decided when the game is played.
  expect(await exclusionsOf('Gc')).toBe(0);

  // The organiser takes Gb out and puts the cut player in.
  await page.getByRole('button', { name: 'Sacar a Gb' }).click();
  await page.getByRole('button', { name: 'Meter a Gc' }).click();
  await page.getByRole('button', { name: 'Confirmar convocatoria' }).click();
  await page.getByRole('button', { name: 'Marcar como jugado' }).click();
  await expect(page.locator('.step.now')).toHaveText('Jugado');

  // Gc played, so no point; Gb was left out, so one.
  expect(await exclusionsOf('Gc')).toBe(0);
  expect(await exclusionsOf('Gb')).toBe(1);
  await page.getByRole('button', { name: 'Puntos', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Gb' });
  await expect(row.getByRole('cell').nth(3)).toHaveText('1');

  // The other specs share this database and expect the usual 14 places.
  await send('patch', `/seasons/${season.id}`, { slots: 14 });
});

test('records a past game in the season its date belongs to', async ({
  page,
  request,
}) => {
  const current = await (await request.get('/api/seasons/current')).json();
  const startYear = Number(current.name.slice(0, 4));
  const pastName = `${startYear - 1}/${startYear}`;
  const known = (await (await request.get('/api/seasons')).json()) as {
    name: string;
  }[];
  if (!known.some(s => s.name === pastName)) {
    const created = await request.post('/api/seasons', {
      data: { name: pastName },
    });
    expect(created.ok()).toBeTruthy();
  }

  await page.goto('/');
  await expect(page.locator('.season')).toHaveText(current.name);

  await page.getByRole('button', { name: '+ Nuevo' }).click();
  await page.getByLabel('Fecha del partido').fill(`${startYear - 1}-10-07`);
  await page.getByRole('button', { name: 'Registrar partido' }).click();

  // The app moves to the season the date falls in, not the current one.
  await expect(page.locator('.season')).toHaveText(pastName);

  // It walks the same path as any other game, only dated in the past.
  await page.getByLabel('Añadir jugadores').fill('Ga\nGb');
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();

  // First time in that season, so their seniority is asked for.
  await expect(page.getByTestId('seniority-prompt')).toHaveCount(2);
  await expect(page.getByLabel('Temporadas de Ga')).toHaveValue('2');
  for (let left = 2; left > 0; left--) {
    await page
      .getByTestId('seniority-prompt')
      .first()
      .getByRole('button', { name: 'Confirmar antigüedad' })
      .click();
    await expect(page.getByTestId('seniority-prompt')).toHaveCount(left - 1);
  }
  await page.getByRole('button', { name: 'Guardar lista' }).click();

  await page.getByRole('button', { name: 'Crear convocatoria' }).click();
  await page.getByRole('button', { name: 'Confirmar convocatoria' }).click();
  await page.getByRole('button', { name: 'Marcar como jugado' }).click();
  await expect(page.locator('.step.now')).toHaveText('Jugado');
  await expect(page.getByTestId('player-row')).toHaveCount(2);
});

test('the candidate list is kept only when saved, and can be edited after a reload', async ({
  page,
  request,
}) => {
  const post = async (path: string, data: unknown) => {
    const res = await request.post(`/api${path}`, { data });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const now = new Date();
  const startYear =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const existing = await (await request.get('/api/seasons/current')).json();
  const season =
    existing ??
    (await post('/seasons', { name: `${startYear}/${startYear + 1}` }));
  for (const name of ['Rosa', 'Sergio', 'Tomás']) {
    await post(`/seasons/${season.id}/players`, { name, seasons: 1 });
  }
  const game = await post('/games', {
    played_on: `${Number(season.name.slice(0, 4))}-11-24`,
  });
  const rows = page.getByTestId('candidate-row');

  await page.goto('/');
  await page.getByLabel('Elegir partido').selectOption(String(game.id));

  // A pasted list is a draft: nothing is saved until the button is pressed.
  await page
    .getByLabel('Añadir jugadores')
    .fill('1. Rosa\n2. Sergio\n3. Nadie');
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();
  await expect(rows).toHaveCount(3);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar' })
    .click();
  await expect(page.getByRole('status')).toHaveText('Cambios sin guardar');
  await page.getByRole('button', { name: 'Guardar lista' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);

  // Hours later: the list is there, in the same order, with the open name.
  await page.reload();
  await page.getByLabel('Elegir partido').selectOption(String(game.id));
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Rosa');
  await expect(rows.nth(1)).toContainText('Sergio');
  await expect(page.getByText('1 sin reconocer')).toBeVisible();

  // More names are added to the list, not swapped for it; a repeat is folded in.
  await page.getByLabel('Añadir jugadores').fill('Tomás\nrosa');
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3)).toContainText('Tomás');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar' })
    .click();

  // Removing a name renumbers the list; leaving it unsaved changes nothing stored.
  await page.getByRole('button', { name: 'Quitar Sergio' }).click();
  await expect(rows).toHaveCount(3);
  await page.reload();
  await page.getByLabel('Elegir partido').selectOption(String(game.id));
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('Sergio');

  // Emptying the list is also a draft until saved.
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Vaciar lista' }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar lista' }).click();
  await page.reload();
  await page.getByLabel('Elegir partido').selectOption(String(game.id));
  await expect(
    page.getByText('Todavía no hay nadie en la lista.')
  ).toBeVisible();
});

test('15 players new to the season: the convocatoria says what is missing, and runs once seniority is confirmed', async ({
  page,
  request,
}) => {
  const post = async (path: string, data: unknown) => {
    const res = await request.post(`/api${path}`, { data });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const now = new Date();
  const startYear =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const existing = await (await request.get('/api/seasons/current')).json();
  const season =
    existing ??
    (await post('/seasons', { name: `${startYear}/${startYear + 1}` }));
  // Everyone played last year but has not yet appeared in this season.
  const earlier = await post('/seasons', { name: '1998/1999' });
  const names = Array.from({ length: 15 }, (_, i) => `Jugador${i + 1}x`);
  for (const name of names) {
    await post(`/seasons/${earlier.id}/players`, { name, seasons: 2 });
  }
  const game = await post('/games', {
    played_on: `${Number(season.name.slice(0, 4))}-10-26`,
  });

  await page.goto('/');
  await page.getByLabel('Elegir partido').selectOption(String(game.id));
  await page.getByLabel('Añadir jugadores').fill(names.join('\n'));
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();
  await page.getByRole('button', { name: 'Guardar lista' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);

  // Without seniority the convocatoria cannot run, and it says so right where
  // the button is, pointing at where to fix it.
  await page.getByRole('button', { name: 'Crear convocatoria' }).click();
  await expect(page.getByRole('alert')).toContainText('Falta la antigüedad');
  await expect(page.getByRole('alert')).toContainText('Lista de apuntados');

  // The list asks for each player's seniority, with a suggestion from last year.
  const prompts = page.getByTestId('seniority-prompt');
  await expect(prompts).toHaveCount(15);
  await expect(prompts.first().getByRole('spinbutton')).toHaveValue('3');
  for (let left = 15; left > 0; left--) {
    await prompts
      .first()
      .getByRole('button', { name: 'Confirmar antigüedad' })
      .click();
    await expect(prompts).toHaveCount(left - 1);
  }

  // Now the convocatoria runs and ranks all 15 for the 14 places.
  await page.getByRole('button', { name: 'Crear convocatoria' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.step.now')).toHaveText('Convocatoria creada');
  await expect(
    page.getByTestId('zone-in').getByTestId('player-row')
  ).toHaveCount(14);
  await expect(
    page.getByTestId('zone-out').getByTestId('player-row')
  ).toHaveCount(1);
});

test('a mistaken name can be removed from the list while it still waits for its seniority', async ({
  page,
  request,
}) => {
  const post = async (path: string, data: unknown) => {
    const res = await request.post(`/api${path}`, { data });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const now = new Date();
  const startYear =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const existing = await (await request.get('/api/seasons/current')).json();
  const season =
    existing ??
    (await post('/seasons', { name: `${startYear}/${startYear + 1}` }));
  const earlier = await post('/seasons', { name: '1997/1998' });
  for (const name of ['Acierto', 'Equivocado']) {
    await post(`/seasons/${earlier.id}/players`, { name, seasons: 1 });
  }
  const game = await post('/games', {
    played_on: `${Number(season.name.slice(0, 4))}-10-19`,
  });

  await page.goto('/');
  await page.getByLabel('Elegir partido').selectOption(String(game.id));
  await page.getByLabel('Añadir jugadores').fill('Acierto\nEquivocado');
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();
  const prompts = page.getByTestId('seniority-prompt');
  await expect(prompts).toHaveCount(2);

  // Quitar sits beside "Confirmar antigüedad", so the wrong name goes without
  // having to confirm it first.
  await prompts
    .filter({ hasText: 'Equivocado' })
    .getByRole('button', { name: 'Quitar Equivocado' })
    .click();
  await expect(page.getByTestId('candidate-row')).toHaveCount(1);
  await expect(prompts).toHaveCount(1);
  await expect(page.getByText('Equivocado')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Quitar Acierto' })
  ).toHaveCount(1);
});
