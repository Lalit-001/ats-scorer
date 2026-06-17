import type { Request, Response, NextFunction, RequestHandler } from "express";

/** Wraps an async route so rejected promises reach Express's error handler. */
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
