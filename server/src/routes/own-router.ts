import { Router, type Request, type Response } from 'express';
import { ContactError } from '../domain/contact-validator.js';
import type { ContactService } from '../repo/contact-service.js';
import type { OwnDataService } from '../repo/own-data-service.js';
import { HttpError, type HttpErrorHandler } from './http-error.js';
import type { OwnPlayer } from './own-player.js';

/**
 * The player's own routes, mounted under `/me` for a user acting as a regular user. Every one
 * answers about the caller's own player (never one named in the request) and reads what the
 * disclosure rules allow; the only thing a player can change here is their contact data.
 */
export class OwnRouter {
  constructor(
    private readonly own: OwnPlayer,
    private readonly data: OwnDataService,
    private readonly contacts: ContactService,
    private readonly errors: HttpErrorHandler
  ) {}

  router(): Router {
    const router = Router();
    router.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    });
    router.use(this.own.middleware());
    router.get('/debts', (_req, res) => {
      res.json(this.data.debts(this.me(res)));
    });
    router.get('/payments', (_req, res) => {
      res.json(this.data.payments(this.me(res)));
    });
    router.get('/report', (_req, res) => {
      res.json(this.data.report(this.me(res)));
    });
    router.get('/contact', (_req, res) => {
      res.json(this.contacts.get(this.me(res)));
    });
    router.patch('/contact', (req, res) => {
      res.json(this.saveContact(req, res));
    });
    router.use(this.errors.handler());
    return router;
  }

  private me(res: Response): number {
    return this.own.playerOf(res);
  }

  private saveContact(req: Request, res: Response) {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'Se esperaba un objeto');
    }
    try {
      return this.contacts.save(this.me(res), body);
    } catch (err) {
      if (err instanceof ContactError) throw new HttpError(422, err.message);
      throw err;
    }
  }
}
