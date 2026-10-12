import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Headers every response carries; API answers are never cached. */
export class SecurityHeaders {
  middleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (req.path.startsWith('/api/'))
        res.setHeader('Cache-Control', 'no-store');
      next();
    };
  }
}
