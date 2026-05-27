import type { RequestHandler } from "express";

/** Wraps an async route handler and forwards any thrown error to Express's next(). */
export const catchAsync =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
