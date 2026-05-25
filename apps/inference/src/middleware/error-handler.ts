import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'ValidationError',
      issues: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
    return;
  }

  const status = typeof (err as { status?: unknown }).status === 'number'
    ? (err as { status: number }).status
    : 500;

  res.status(status).json({
    error: status === 500 ? 'InternalServerError' : 'RequestError',
    message: isProd && status === 500 ? 'Internal server error' : (err as Error).message,
  });
};
