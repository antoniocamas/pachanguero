import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthTestApp } from './auth-test-support.js';
import { RouteLister } from './route-lister-test-support.js';

type Repo = typeof import('../repo/index.js');

interface Actor {
  token: string;
  playerId: number;
}

describe('the player own routes', () => {
  let app: AuthTestApp;
  let repo: Repo;
  let seasonId: number;
  let day = 0;

  beforeAll(async () => {
    app = await AuthTestApp.start();
    repo = await import('../repo/index.js');
    seasonId = repo.seasons.create({ name: '2026/2027' }).id;
  });
  afterAll(async () => {
    await app.close();
  });

  /** A regular user with their player, and a token for them. */
  const actor = async (name: string): Promise<Actor> => {
    const user = await app.createUser(
      name.toLowerCase().replace(/\s/g, ''),
      'regular',
      name
    );
    return {
      token: await app.tokenFor('regular', user.id),
      playerId: user.playerId!,
    };
  };
  /** A player with no account, for a named guest. */
  const guest = (name: string) => repo.players.register(name).id;
  /** A played game, so its shares can be settled. */
  const playedGame = (label: string | null = null): number => {
    day++;
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    const game = repo.games.create(seasonId, date, label ?? undefined);
    repo.games.setState(game.id, 'played');
    return game.id;
  };
  const owe = (
    gameId: number,
    holder: number,
    member: { playerId: number } | { hostPlayerId: number; ordinal: number },
    cents: number
  ) => repo.debtRepository.insert(gameId, member, holder, cents);
  const get = (path: string, token: string) => app.request(path, { token });
  const text = (body: unknown) => JSON.stringify(body);

  describe('debts', () => {
    it('shows a share the player holds for themselves, and its total', async () => {
      const carlos = await actor('Carlos García');
      owe(playedGame(), carlos.playerId, { playerId: carlos.playerId }, 500);

      const reply = await get('/api/me/debts', carlos.token);

      expect(reply.status).toBe(200);
      expect(reply.body).toMatchObject({
        owedCents: 500,
        mine: [{ amountCents: 500, kind: 'own' }],
        heldByHost: [],
      });
    });

    it('shows a share a host holds for the player with the host name, outside the total', async () => {
      const carlos = await actor('Carlos Lorca');
      const ana = await actor('Ana Lorca');
      owe(playedGame(), ana.playerId, { playerId: carlos.playerId }, 500);

      const reply = await get('/api/me/debts', carlos.token);

      expect(reply.body).toMatchObject({
        owedCents: 0,
        mine: [],
        heldByHost: [{ amountCents: 500, holderName: 'Ana Lorca' }],
      });
    });

    it("shows the host their own share and their guests', naming the named guest but no id", async () => {
      const ana = await actor('Ana Ruiz');
      const juanito = guest('Juanito Secreto');
      const game = playedGame();
      owe(game, ana.playerId, { playerId: ana.playerId }, 500);
      owe(game, ana.playerId, { playerId: juanito }, 500);
      owe(game, ana.playerId, { hostPlayerId: ana.playerId, ordinal: 1 }, 500);
      repo.guestCandidates.put(game, {
        position: 2,
        player_id: juanito,
        host_player_id: ana.playerId,
      });

      const reply = await get('/api/me/debts', ana.token);

      expect(reply.body).toMatchObject({ owedCents: 1500 });
      const kinds = (
        reply.body as unknown as { mine: { kind: string }[] }
      ).mine.map(r => r.kind);
      expect(kinds.sort()).toEqual(['guest', 'guest', 'own']);
      expect(text(reply.body)).toContain('Juanito Secreto');
      expect(text(reply.body)).not.toContain(String(juanito + 1000));
      expect(text(reply.body)).not.toMatch(/"(player|holder|beneficiary)Id"/);
    });

    it('answers empty lists and a zero total when nothing is owed', async () => {
      const luis = await actor('Luis Vacío');
      const reply = await get('/api/me/debts', luis.token);
      expect(reply.body).toEqual({ owedCents: 0, mine: [], heldByHost: [] });
    });

    it("contains nothing of another player's shares", async () => {
      const carlos = await actor('Carlos Aparte');
      const ana = await actor('Ana Aparte');
      const game = playedGame();
      owe(game, carlos.playerId, { playerId: carlos.playerId }, 500);
      owe(game, ana.playerId, { playerId: ana.playerId }, 1500);

      const reply = await get('/api/me/debts', carlos.token);

      expect(text(reply.body)).not.toContain('Ana Aparte');
      expect(text(reply.body)).not.toContain('1500');
      expect(text(reply.body)).not.toContain(`${ana.playerId},`);
    });

    it('drops a share once it is paid, and the total with it', async () => {
      const carlos = await actor('Carlos Pagador');
      const game = playedGame();
      owe(game, carlos.playerId, { playerId: carlos.playerId }, 500);
      expect((await get('/api/me/debts', carlos.token)).body).toMatchObject({
        owedCents: 500,
      });

      repo.paymentService.pay(game, {
        method: 'efectivo',
        shares: [{ playerId: carlos.playerId }],
        payerPlayerId: carlos.playerId,
      });

      expect((await get('/api/me/debts', carlos.token)).body).toEqual({
        owedCents: 0,
        mine: [],
        heldByHost: [],
      });
    });
  });

  describe('payments', () => {
    const pay = (
      gameId: number,
      holder: number,
      member: { playerId: number },
      payer: number,
      paidOn: string
    ) =>
      repo.paymentRepository.append({
        gameId,
        member,
        holderId: holder,
        payerId: payer,
        amountCents: 500,
        paidOn,
        method: 'efectivo',
      });

    it('lists what the player paid, newest first', async () => {
      const carlos = await actor('Carlos Cobros');
      pay(
        playedGame(),
        carlos.playerId,
        { playerId: carlos.playerId },
        carlos.playerId,
        '2026-10-02'
      );
      pay(
        playedGame(),
        carlos.playerId,
        { playerId: carlos.playerId },
        carlos.playerId,
        '2026-10-09'
      );

      const reply = await get('/api/me/payments', carlos.token);

      expect(reply.status).toBe(200);
      expect(
        (reply.body as unknown as { paidOn: string }[]).map(p => p.paidOn)
      ).toEqual(['2026-10-09', '2026-10-02']);
      expect(reply.body).toMatchObject([
        { kind: 'own', paidBy: null },
        { kind: 'own', paidBy: null },
      ]);
    });

    it('names the host who paid the share they answer for', async () => {
      const carlos = await actor('Carlos Invitado');
      const ana = await actor('Ana Anfitriona');
      pay(
        playedGame(),
        ana.playerId,
        { playerId: carlos.playerId },
        ana.playerId,
        '2026-10-03'
      );

      const reply = await get('/api/me/payments', carlos.token);

      expect(reply.body).toMatchObject([
        { kind: 'own', paidBy: { name: 'Ana Anfitriona' } },
      ]);
    });

    it('marks the shares the player paid for guests, without naming them', async () => {
      const ana = await actor('Ana Paga');
      const juanito = guest('Juanito Callado');
      pay(
        playedGame(),
        ana.playerId,
        { playerId: juanito },
        ana.playerId,
        '2026-10-04'
      );

      const reply = await get('/api/me/payments', ana.token);

      expect(reply.body).toMatchObject([{ kind: 'guest', paidBy: null }]);
      expect(text(reply.body)).not.toContain('Juanito');
    });

    it('does not name a third person who paid', async () => {
      const carlos = await actor('Carlos Tercero');
      const ana = await actor('Ana Titular');
      const luis = await actor('Luis Tercero');
      pay(
        playedGame(),
        ana.playerId,
        { playerId: carlos.playerId },
        luis.playerId,
        '2026-10-05'
      );

      const reply = await get('/api/me/payments', carlos.token);

      expect(reply.body).toMatchObject([{ kind: 'own', paidBy: 'other' }]);
      expect(text(reply.body)).not.toContain('Luis Tercero');
    });

    it('shows the method of each payment and nothing of the Bizum behind it, to the player and to an admin looking as them', async () => {
      const luis = await actor('Luis Bizum');
      const boss = await app.createUser('bossbizum', 'admin', 'Boss Bizum');
      const game = playedGame();
      app.conn
        .prepare(
          `INSERT INTO bizums (account, reference, direction, booked_on, amount_cents, currency,
                               sender_name, subject, kept_at)
           VALUES ('h', 'ref-secreta', 'incoming', '2026-10-12', 450, 'EUR',
                   'Remitente Secreto', 'asunto secreto', 'x')`
        )
        .run();
      const bizumId = (
        app.conn
          .prepare('SELECT id FROM bizums WHERE reference = ?')
          .get('ref-secreta') as { id: number }
      ).id;
      app.conn
        .prepare(
          `INSERT INTO bizum_handling (bizum_id, status, unallocated_cents, settled_how, updated_at)
           VALUES (?, 'settled', 50, 'organiser', 'x')`
        )
        .run(bizumId);
      repo.paymentRepository.append({
        gameId: game,
        member: { playerId: luis.playerId },
        holderId: luis.playerId,
        payerId: luis.playerId,
        amountCents: 400,
        paidOn: '2026-10-12',
        method: 'bizum',
        bizumId,
      });
      const viewers: Record<string, string> = {
        'a player': luis.token,
        'an admin using "Ver como otro jugador"':
          await app.server.tokens.issueAccess(
            {
              userId: boss.id,
              role: 'admin',
              view: 'regular',
              actingAs: luis.playerId,
            },
            app.clock.now()
          ),
      };

      for (const token of Object.values(viewers)) {
        const reply = await get('/api/me/payments', token);

        expect(reply.body).toMatchObject([
          { method: 'bizum', amountCents: 400 },
        ]);
        expect(text(reply.body)).not.toMatch(
          /secret|ref-|unallocated|bizumId|bookedOn|sender|subject|"reference"/i
        );
      }
    });

    it('shows the method of a payment made by hand', async () => {
      const luis = await actor('Luis Efectivo');
      pay(
        playedGame(),
        luis.playerId,
        { playerId: luis.playerId },
        luis.playerId,
        '2026-10-04'
      );

      expect((await get('/api/me/payments', luis.token)).body).toMatchObject([
        { method: 'efectivo' },
      ]);
    });

    it('is an empty list when the player has paid nothing', async () => {
      const luis = await actor('Luis Sin Pagos');
      expect((await get('/api/me/payments', luis.token)).body).toEqual([]);
    });
  });

  describe('report', () => {
    it('is the player report without ids, without the standing, and without a third payer name', async () => {
      const carlos = await actor('Carlos Informe');
      const ana = await actor('Ana Informe');
      const luis = await actor('Luis Informe');
      repo.players.add(seasonId, 'Carlos Informe', 1);
      const paidGame = playedGame();
      const owedGame = playedGame();
      for (const id of [paidGame, owedGame]) {
        repo.participations.set(id, carlos.playerId, {
          signed_up: true,
          played: true,
        });
      }
      repo.paymentRepository.append({
        gameId: paidGame,
        member: { playerId: carlos.playerId },
        holderId: ana.playerId,
        payerId: luis.playerId,
        amountCents: 500,
        paidOn: '2026-10-06',
        method: 'efectivo',
      });
      owe(owedGame, ana.playerId, { playerId: carlos.playerId }, 500);

      const reply = await get('/api/me/report', carlos.token);

      expect(reply.status).toBe(200);
      const body = reply.body as unknown as {
        player: { name: string };
        games: {
          gameId: number;
          stats: { payment: Record<string, unknown> };
        }[];
        seasonStats: { points: Record<string, unknown> };
      };
      expect(body.player.name).toBe('Carlos Informe');
      expect(body.seasonStats.points).not.toHaveProperty('rank');
      expect(body.seasonStats.points).not.toHaveProperty('of');
      const byGame = new Map(body.games.map(g => [g.gameId, g.stats.payment]));
      expect(byGame.get(paidGame)).toEqual({
        status: 'paid',
        amountCents: 500,
        paidOn: '2026-10-06',
      });
      expect(byGame.get(owedGame)).toEqual({
        status: 'owed',
        amountCents: 500,
        holderName: 'Ana Informe',
      });
      expect(text(body)).not.toContain('Luis Informe');
      expect(text(body)).not.toMatch(/"(payer|holder)Id"/);
    });
  });

  describe('who can call them', () => {
    const routes = ['/api/me/debts', '/api/me/payments', '/api/me/report'];

    it.each(routes)('has no way to write through %s', async path => {
      const carlos = await actor(`Carlos Lectura ${path.length}`);
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const reply = await app.request(path, {
          method,
          token: carlos.token,
          body: {},
        });
        expect(reply.status).toBe(403);
      }
      expect(
        new RouteLister()
          .list(app.routes.ownRouter)
          .filter(r => r.endsWith(path.replace('/api/me', '')))
      ).toEqual([`GET ${path.replace('/api/me', '')}`]);
    });

    it.each([...routes, '/api/me/contact'])(
      'answers 403 on %s to an admin with no player in the regular view',
      async path => {
        const boss = await app.createUser(`boss${path.length}`, 'admin');
        const token = await app.tokenFor(
          { role: 'admin', view: 'regular' },
          boss.id
        );
        const reply = await get(path, token);
        expect(reply.status).toBe(403);
        expect(reply.body.error).toBe('No tienes un jugador asociado');
      }
    );

    it('answers 403 to an admin in the admin view', async () => {
      const boss = await app.createUser('bossadmin', 'admin', 'Jefe Admin');
      const token = await app.tokenFor('admin', boss.id);
      expect((await get('/api/me/debts', token)).status).toBe(403);
    });

    it('reads the caller own data whatever id the request carries', async () => {
      const carlos = await actor('Carlos Propio');
      const ana = await actor('Ana Ajena');
      owe(playedGame(), ana.playerId, { playerId: ana.playerId }, 1500);
      owe(playedGame(), carlos.playerId, { playerId: carlos.playerId }, 500);

      const reply = await get(
        `/api/me/debts?playerId=${ana.playerId}&holderId=${ana.playerId}`,
        carlos.token
      );

      expect(reply.body).toMatchObject({ owedCents: 500 });
      expect(text(reply.body)).not.toContain('1500');
    });
  });

  describe('contact', () => {
    it('saves an email and a phone and reads them back', async () => {
      const carlos = await actor('Carlos Contacto');

      const saved = await app.request('/api/me/contact', {
        method: 'PATCH',
        token: carlos.token,
        body: { emails: ['carlos@example.com'], phone: '+34 600 123 456' },
      });
      const read = await get('/api/me/contact', carlos.token);

      expect(saved.status).toBe(200);
      expect(saved.body).toEqual({
        emails: ['carlos@example.com'],
        phone: '+34 600 123 456',
      });
      expect(read.body).toEqual(saved.body);
    });

    it.each([
      [{ emails: ['carlos'] }, 'email no válido'],
      [{ emails: ['carlos@example'] }, 'email no válido'],
      [{ emails: ['@example.com'] }, 'email no válido'],
      [{ phone: '12345' }, 'teléfono no válido'],
      [{ phone: 'abc' }, 'teléfono no válido'],
      [{ phone: '1234567890123456' }, 'teléfono no válido'],
    ])(
      'refuses %j with 422 naming the field and keeps the previous values',
      async (body, message) => {
        const carlos = await actor(
          `Carlos Inválido ${JSON.stringify(body).length}`
        );
        await app.request('/api/me/contact', {
          method: 'PATCH',
          token: carlos.token,
          body: { emails: ['previo@example.com'], phone: '600123456' },
        });

        const reply = await app.request('/api/me/contact', {
          method: 'PATCH',
          token: carlos.token,
          body,
        });

        expect(reply.status).toBe(422);
        expect(reply.body.error).toBe(message);
        expect((await get('/api/me/contact', carlos.token)).body).toEqual({
          emails: ['previo@example.com'],
          phone: '600123456',
        });
      }
    );

    it('clears the phone and keeps the email', async () => {
      const carlos = await actor('Carlos Borra');
      await app.request('/api/me/contact', {
        method: 'PATCH',
        token: carlos.token,
        body: { emails: ['carlos@example.com'], phone: '600123456' },
      });

      const reply = await app.request('/api/me/contact', {
        method: 'PATCH',
        token: carlos.token,
        body: { phone: '' },
      });

      expect(reply.body).toEqual({
        emails: ['carlos@example.com'],
        phone: null,
      });
    });

    it.each(['name', 'introducedBy', 'games', 'playerId'])(
      'refuses a body with %s and leaves the player alone',
      async field => {
        const carlos = await actor(`Carlos Campo ${field}`);
        const before = repo.players.nameOf(carlos.playerId);

        const reply = await app.request('/api/me/contact', {
          method: 'PATCH',
          token: carlos.token,
          body: { emails: ['carlos@example.com'], [field]: 'otro' },
        });

        expect(reply.status).toBe(422);
        expect(reply.body.error).toBe(`campo no permitido: ${field}`);
        expect(repo.players.nameOf(carlos.playerId)).toBe(before);
        expect((await get('/api/me/contact', carlos.token)).body).toEqual({
          emails: [],
          phone: null,
        });
      }
    );

    it('refuses a body that is not an object', async () => {
      const carlos = await actor('Carlos Cuerpo');
      const reply = await app.request('/api/me/contact', {
        method: 'PATCH',
        token: carlos.token,
        body: ['email'],
      });
      expect(reply.status).toBe(400);
    });

    it('lets two players hold the same email', async () => {
      const ana = await actor('Ana Casa');
      const luis = await actor('Luis Casa');
      for (const who of [ana, luis]) {
        const reply = await app.request('/api/me/contact', {
          method: 'PATCH',
          token: who.token,
          body: { emails: ['casa@example.com'] },
        });
        expect(reply.status).toBe(200);
      }
    });
  });
});
