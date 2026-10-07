import { LocalCalendar } from '../domain/local-calendar.js';
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
  candidateResolution,
  participations,
  standingsService,
  convocatoriaService,
  convocatoriaEdit,
  gameLifecycle,
  debtRepository,
  paymentRepository,
  paymentService,
  teamAssignment,
  teamPaste,
  gameView,
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

/** `{ name }` of today's season when it has not been created yet, else null. */
api.get(
  '/seasons/missing',
  route((_req, res) => {
    const name = seasons.missing(new LocalCalendar().dateOf(new Date()));
    res.json(name ? { name } : null);
  })
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
    const view = gameView.view(id(req.params.gameId));
    if (!view) return res.status(404).json({ error: 'not found' });
    res.json(view);
  })
);

api.patch(
  '/games/:gameId',
  route((req, res) => res.json(games.update(id(req.params.gameId), req.body)))
);

const STATE_ACTIONS = ['play', 'reopen', 'cancel', 'uncancel'];

/** Moves a game along its lifecycle; creating and confirming the convocatoria have their own routes. */
api.post(
  '/games/:gameId/state',
  route((req, res) => {
    const action = req.body?.action;
    if (!STATE_ACTIONS.includes(action)) throw new Error('Acción no válida');
    const gameId = id(req.params.gameId);
    gameLifecycle.perform(gameId, action);
    res.json(gameLifecycle.describe(gameId));
  })
);

api.delete(
  '/games/:gameId',
  route((req, res) => {
    games.delete(id(req.params.gameId));
    res.json({ ok: true });
  })
);

/* --------------------------------------------------------------- payments */

/** A share is named like a convocatoria member: a player, or the nth '+1' of a host. */
const memberOf = (v: unknown) => {
  const member = v as {
    playerId?: unknown;
    hostPlayerId?: unknown;
    ordinal?: unknown;
  };
  if (member && 'playerId' in member) return { playerId: id(member.playerId) };
  if (member && 'hostPlayerId' in member)
    return {
      hostPlayerId: id(member.hostPlayerId),
      ordinal: id(member.ordinal),
    };
  throw new Error('Cada parte debe nombrar a un jugador o a un invitado');
};

/** Settles one or more shares of a played game; the payer is whoever hands over the money. */
api.post(
  '/games/:gameId/payments',
  route((req, res) => {
    const { shares, payerPlayerId, amountCents, paidOn } = req.body ?? {};
    if (!Array.isArray(shares)) throw new Error('shares must be a list');
    const gameId = id(req.params.gameId);
    paymentService.pay(gameId, {
      shares: shares.map(memberOf),
      payerPlayerId: id(payerPlayerId),
      amountCents,
      paidOn,
    });
    res.status(201).json({
      debts: debtRepository.list(gameId),
      payments: paymentRepository.list(gameId),
    });
  })
);

api.delete(
  '/games/:gameId/payments/:paymentId',
  route((req, res) => {
    const gameId = id(req.params.gameId);
    paymentService.undo(gameId, id(req.params.paymentId));
    res.json({
      debts: debtRepository.list(gameId),
      payments: paymentRepository.list(gameId),
    });
  })
);

/* ------------------------------------------------------------------ teams */

const teamOf = (v: unknown) => {
  if (v !== 'claros' && v !== 'oscuros')
    throw new Error('team must be claros or oscuros');
  return v;
};

api.get(
  '/games/:gameId/teams',
  route((req, res) => res.json(teamAssignment.read(id(req.params.gameId))))
);

/** Replaces the teams with the given assignments, however they were produced. */
api.put(
  '/games/:gameId/teams',
  route((req, res) => {
    const list = req.body?.assignments;
    if (!Array.isArray(list)) throw new Error('assignments must be a list');
    const gameId = id(req.params.gameId);
    teamAssignment.assign(
      gameId,
      list.map(a => ({ playerId: id(a?.playerId), team: teamOf(a?.team) }))
    );
    res.json(teamAssignment.read(gameId));
  })
);

api.post(
  '/games/:gameId/teams/paste',
  route((req, res) => {
    if (typeof req.body?.text !== 'string')
      throw new Error('text must be a string');
    res.json(teamPaste.paste(id(req.params.gameId), req.body.text));
  })
);

api.post(
  '/games/:gameId/teams/paste/resolve',
  route((req, res) => {
    const { line, field, team, action } = req.body ?? {};
    if (!line || !action) throw new Error('line and action are required');
    res.json(
      teamPaste.resolve(
        id(req.params.gameId),
        { line, field, team: teamOf(team) },
        action
      )
    );
  })
);

/* --------------------------------------------------------- participations */

api.put(
  '/games/:gameId/players/:playerId',
  route((req, res) => {
    gameLifecycle.require(id(req.params.gameId), 'edit_apuntados');
    if (req.body?.signed_up === false)
      convocatoriaEdit.requireNotMember(
        id(req.params.gameId),
        id(req.params.playerId)
      );
    participations.set(id(req.params.gameId), id(req.params.playerId), {
      signed_up: req.body?.signed_up,
      note: req.body?.note,
    });
    res.json(participations.list(id(req.params.gameId)));
  })
);

api.delete(
  '/games/:gameId/players/:playerId',
  route((req, res) => {
    gameLifecycle.require(id(req.params.gameId), 'edit_apuntados');
    convocatoriaEdit.requireNotMember(
      id(req.params.gameId),
      id(req.params.playerId)
    );
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

/** Creates the convocatoria, or recreates it (which discards hand corrections only when told to). */
api.post(
  '/games/:gameId/convocatoria',
  route((req, res) =>
    res.json(
      convocatoriaService.create(id(req.params.gameId), {
        discardEdits: req.body?.discardEdits === true,
      })
    )
  )
);

api.post(
  '/games/:gameId/convocatoria/confirm',
  route((req, res) => {
    const gameId = id(req.params.gameId);
    convocatoriaService.confirm(gameId);
    res.json(convocatoriaService.saved(gameId));
  })
);

/** Puts a member in or out of the playing line: a player, or the nth '+1' of a host. */
api.put(
  '/games/:gameId/convocatoria/members',
  route((req, res) => {
    const { member, playing } = req.body ?? {};
    if (typeof playing !== 'boolean')
      throw new Error('playing must be true or false');
    const key =
      member && 'playerId' in member
        ? { playerId: id(member.playerId) }
        : member && 'hostPlayerId' in member
          ? {
              hostPlayerId: id(member.hostPlayerId),
              ordinal: id(member.ordinal),
            }
          : null;
    if (!key) throw new Error('member must name a player or a guest of a host');
    const gameId = id(req.params.gameId);
    convocatoriaEdit.move(gameId, key, playing);
    res.json(convocatoriaService.saved(gameId));
  })
);

/* ------------------------------------------------------------------ errors */

api.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ error: err.message });
});
