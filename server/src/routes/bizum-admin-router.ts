import { Router } from 'express';
import {
  BizumRefusal,
  type BizumResolutionService,
} from '../repo/bizum-resolution-service.js';
import type { SenderPairingService } from '../repo/sender-pairing-service.js';
import { HttpError, type HttpErrorHandler } from './http-error.js';

/** The organiser's routes for the Bizums that wait. Mounted behind the admin guard. */
export class BizumAdminRouter {
  constructor(
    private readonly resolution: BizumResolutionService,
    private readonly pairing: SenderPairingService,
    private readonly errors: HttpErrorHandler
  ) {}

  router(): Router {
    const router = Router();
    router.get('/bizums/waiting', (_req, res) => {
      res.json(this.resolution.waiting());
    });
    router.get('/bizums/pairings', (_req, res) => {
      res.json(this.pairing.pairings());
    });
    router.put('/bizums/pairings/:playerId', (req, res) => {
      const { bizumName } = this.bodyOf(req.body);
      if (typeof bizumName !== 'string') {
        throw new HttpError(400, 'Nombre de Bizum no válido');
      }
      this.refused(() =>
        this.pairing.setBizumName(this.idIn(req.params.playerId), bizumName)
      );
      res.json(this.pairing.pairings());
    });
    router.delete('/bizums/pairings/:playerId', (req, res) => {
      this.refused(() =>
        this.pairing.clearBizumName(this.idIn(req.params.playerId))
      );
      res.json(this.pairing.pairings());
    });
    router.get('/bizums/:id/open-shares', (req, res) => {
      const playerId = this.idIn(req.query.playerId);
      res.json(
        this.refused(() =>
          this.resolution.openShares(this.idIn(req.params.id), playerId)
        )
      );
    });
    router.post('/bizums/:id/pair', (req, res) => {
      const { playerId } = this.bodyOf(req.body);
      const result = this.refused(() =>
        this.pairing.pair(this.idIn(req.params.id), this.idIn(playerId))
      );
      res.json({ ...result, waiting: this.resolution.waiting() });
    });
    router.post('/bizums/:id/rule', (req, res) => {
      const { playerId, shares } = this.bodyOf(req.body);
      const ruling = this.refused(() =>
        this.resolution.rule(
          this.idIn(req.params.id),
          this.idIn(playerId),
          typeof shares === 'number' ? shares : Number.NaN
        )
      );
      res.json({ ...ruling, waiting: this.resolution.waiting() });
    });
    router.post('/bizums/:id/dismiss', (req, res) => {
      this.refused(() => this.resolution.dismiss(this.idIn(req.params.id)));
      res.json({ waiting: this.resolution.waiting() });
    });
    router.use(this.errors.handler());
    return router;
  }

  private bodyOf(body: unknown): Record<string, unknown> {
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  }

  private idIn(value: unknown): number {
    const id = typeof value === 'string' ? Number(value) : value;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      throw new HttpError(400, 'Datos no válidos');
    }
    return id;
  }

  private refused<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      throw error instanceof BizumRefusal
        ? new HttpError(400, error.message)
        : error;
    }
  }
}
