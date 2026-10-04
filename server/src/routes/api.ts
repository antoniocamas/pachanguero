import { CandidateLineReader } from '../repo/candidate-line-reader.js';
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
  schedule,
  finalListTarget,
  candidateResolution,
  finalListResolution,
  participations,
  standingsService,
  convocatoriaService,
} from '../repo/index.js';

export const api = Router();
const candidateLines = new CandidateLineReader();

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

/** Every known player, enrolled in any season or not: what a name can be linked to. */
api.get(
  '/players',
  route((_req, res) => res.json(players.listAll()))
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

/* --------------------------------------------------------------- schedule */

api.get(
  '/schedule',
  route((_req, res) => res.json(schedule.list()))
);

/** Adds a schedule version; earlier rows are never edited. */
api.put(
  '/schedule',
  route((req, res) => {
    const { weekday, kickoff_time, effective_from } = req.body ?? {};
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error('weekday must be an integer 0-6 (Sunday = 0)');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(kickoff_time))) {
      throw new Error('kickoff_time must be HH:MM');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effective_from))) {
      throw new Error('effective_from must be YYYY-MM-DD');
    }
    res
      .status(201)
      .json(schedule.create({ weekday, kickoff_time, effective_from }));
  })
);

/* ------------------------------------------------------------------ games */

api.get(
  '/games/:gameId/candidates',
  route((req, res) =>
    res.json({
      rows: candidateResolution.load(
        candidateResolution.target(String(req.params.gameId))
      ),
    })
  )
);

/** What a list would look like, with the pasted text added to it; stores nothing. */
api.post(
  '/games/:gameId/candidates/preview',
  route((req, res) => {
    const lines = candidateLines.read(req.body?.lines ?? []);
    const paste = req.body?.paste ?? '';
    if (typeof paste !== 'string') throw new Error('paste must be text');
    res.json({
      rows: candidateResolution.preview(
        candidateResolution.target(String(req.params.gameId)),
        lines,
        paste
      ),
    });
  })
);

api.put(
  '/games/:gameId/candidates',
  route((req, res) => {
    res.json({
      rows: candidateResolution.save(
        candidateResolution.target(String(req.params.gameId)),
        candidateLines.read(req.body?.lines)
      ),
    });
  })
);

api.post(
  '/games/:gameId/candidates/resolve',
  route((req, res) => {
    const { line, field, action } = req.body ?? {};
    if (!line || !action) throw new Error('line and action are required');
    res.json(
      candidateResolution.resolve(
        candidateResolution.target(String(req.params.gameId)),
        { line, field: field ?? (line.kind === 'plusOne' ? 'host' : 'name') },
        action
      )
    );
  })
);

api.post(
  '/games/final\\:paste',
  route((req, res) => {
    const text = req.body?.text;
    if (typeof text !== 'string') throw new Error('text is required');
    const gameId = req.body?.gameId;
    res.json(
      finalListResolution.paste(
        text,
        gameId === undefined ? undefined : id(gameId)
      )
    );
  })
);

api.post(
  '/games/:gameId/final/resolve',
  route((req, res) => {
    const { line, field, team, action } = req.body ?? {};
    if (!line || !action) throw new Error('line and action are required');
    if (team !== 'claros' && team !== 'oscuros') {
      throw new Error('team must be claros or oscuros');
    }
    res.json(
      finalListResolution.resolve(
        id(req.params.gameId),
        {
          line,
          field: field ?? (line.kind === 'plusOne' ? 'host' : 'name'),
          team,
        },
        action
      )
    );
  })
);

api.get(
  '/games/final-list-target',
  route((_req, res) => res.json({ game: finalListTarget.resolve() ?? null }))
);

api.get(
  '/seasons/:id/games',
  route((req, res) => res.json(games.list(id(req.params.id))))
);

/** The season is never picked: it is whichever one the date falls in. */
api.post(
  '/games',
  route((req, res) => {
    const playedOn = String(req.body?.played_on ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn)) {
      throw new Error('played_on must be YYYY-MM-DD');
    }
    const season = seasons.current(playedOn);
    if (!season) throw new Error(`No hay temporada para el ${playedOn}`);
    res.status(201).json(games.create(season.id, playedOn, req.body.label));
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
