import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import {
  seasons,
  players,
  aliases,
  games,
  participations,
  standingsService,
  convocatoriaService,
} from '../repo/index.js';

export const api = Router();

/** Wrap a handler so a thrown error becomes a 400 instead of an unhandled crash. */
const route =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req, res);
    } catch (err) {
      next(err);
    }
  };

const id = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Bad id: ${v}`);
  return n;
};

const seasonsOf = (v: unknown): number => {
  const n = Number(v);
  if (v === undefined || v === null || !Number.isInteger(n) || n < 0) {
    throw new Error('seasons must be a non-negative integer');
  }
  return n;
};

/* ---------------------------------------------------------------- seasons */

api.get(
  '/seasons',
  route((_req, res) => res.json(seasons.list()))
);

api.get(
  '/seasons/current',
  route((_req, res) => res.json(seasons.current() ?? null))
);

api.post(
  '/seasons',
  route((req, res) => {
    if (!req.body?.name) throw new Error('name is required');
    res.status(201).json(seasons.create(req.body));
  })
);

api.patch(
  '/seasons/:id',
  route((req, res) => res.json(seasons.update(id(req.params.id), req.body)))
);

api.get(
  '/seasons/:id/standings',
  route((req, res) => res.json(standingsService.standings(id(req.params.id))))
);

/* ---------------------------------------------------------------- players */

api.get(
  '/seasons/:id/players',
  route((req, res) => res.json(players.list(id(req.params.id))))
);

api.post(
  '/seasons/:id/players',
  route((req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new Error('name is required');
    res
      .status(201)
      .json(players.add(id(req.params.id), name, seasonsOf(req.body?.seasons)));
  })
);

api.get(
  '/seasons/:id/players/:playerId/seniority-suggestion',
  route((req, res) => {
    const seasonId = id(req.params.id);
    const playerId = id(req.params.playerId);
    if (players.hasAppeared(seasonId, playerId)) {
      res.json({ hasAppeared: true });
    } else {
      res.json({
        hasAppeared: false,
        suggested: players.suggestSeniority(seasonId, playerId),
      });
    }
  })
);

api.post(
  '/seasons/:id/players/:playerId/seniority',
  route((req, res) => {
    const playerId = id(req.params.playerId);
    const name = players.nameOf(playerId);
    if (!name) throw new Error(`Unknown player: ${playerId}`);
    res
      .status(201)
      .json(players.add(id(req.params.id), name, seasonsOf(req.body?.seasons)));
  })
);

api.post(
  '/players/:playerId/aliases',
  route((req, res) => {
    const playerId = id(req.params.playerId);
    if (!players.nameOf(playerId))
      throw new Error(`Unknown player: ${playerId}`);
    const alias = String(req.body?.alias ?? '').trim();
    if (!alias) throw new Error('alias is required');
    aliases.add(playerId, alias);
    res.status(201).json({ playerId, alias });
  })
);

api.patch(
  '/seasons/:id/players/:playerId',
  route((req, res) => {
    players.updateSeasonPlayer(
      id(req.params.id),
      id(req.params.playerId),
      req.body
    );
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ games */

api.get(
  '/seasons/:id/games',
  route((req, res) => res.json(games.list(id(req.params.id))))
);

api.post(
  '/seasons/:id/games',
  route((req, res) => {
    if (!req.body?.played_on) throw new Error('played_on is required');
    res
      .status(201)
      .json(
        games.create(
          id(req.params.id),
          req.body.played_on,
          req.body.label,
          req.body.status
        )
      );
  })
);

api.get(
  '/games/:gameId',
  route((req, res) => {
    const game = games.get(id(req.params.gameId));
    if (!game) return res.status(404).json({ error: 'not found' });
    res.json({
      game,
      participations: participations.list(game.id),
      convocatoria: convocatoriaService.saved(game.id),
    });
  })
);

api.patch(
  '/games/:gameId',
  route((req, res) => res.json(games.update(id(req.params.gameId), req.body)))
);

api.delete(
  '/games/:gameId',
  route((req, res) => {
    games.delete(id(req.params.gameId));
    res.json({ ok: true });
  })
);

/* --------------------------------------------------------- participations */

api.put(
  '/games/:gameId/players/:playerId',
  route((req, res) => {
    participations.set(
      id(req.params.gameId),
      id(req.params.playerId),
      req.body ?? {}
    );
    res.json(participations.list(id(req.params.gameId)));
  })
);

api.delete(
  '/games/:gameId/players/:playerId',
  route((req, res) => {
    participations.remove(id(req.params.gameId), id(req.params.playerId));
    res.json(participations.list(id(req.params.gameId)));
  })
);

/* ----------------------------------------------------------- convocatoria */

api.get(
  '/games/:gameId/convocatoria/preview',
  route((req, res) =>
    res.json(convocatoriaService.preview(id(req.params.gameId)))
  )
);

api.post(
  '/games/:gameId/convocatoria',
  route((req, res) =>
    res.json(convocatoriaService.commit(id(req.params.gameId)))
  )
);

/* ------------------------------------------------------------------ errors */

api.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ error: err.message });
});
