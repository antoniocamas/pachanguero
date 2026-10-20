import { Router, type Request } from 'express';
import type { BankConnectionService } from '../repo/bank-connection-service.js';
import { HttpError, type HttpErrorHandler } from './http-error.js';

const MAX_PARAMETER = 1024;

/**
 * Where the bank sends the browser back to, with no sign-in: the single-use state authorises
 * the request. It answers a redirect to the application's own address carrying only a fixed
 * code, never the state, the code or anything the bank said.
 */
export class BankCallbackRouter {
  constructor(
    private readonly bank: BankConnectionService,
    private readonly errors: HttpErrorHandler
  ) {}

  router(): Router {
    const router = Router();
    router.get('/bank/callback', async (req, res) => {
      const outcome = await this.bank.complete({
        state: this.parameter(req, 'state'),
        code: this.parameter(req, 'code'),
        error: this.parameter(req, 'error'),
      });
      res.status(302).location(`/?bank=${outcome}`).end();
    });
    router.use(this.errors.handler());
    return router;
  }

  private parameter(req: Request, name: string): string | null {
    const value = req.query[name];
    if (value === undefined) return null;
    if (typeof value !== 'string' || value.length > MAX_PARAMETER) {
      throw new HttpError(400, 'Parámetro no válido');
    }
    return value;
  }
}
