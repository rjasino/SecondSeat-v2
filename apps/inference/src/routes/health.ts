import { Router } from 'express';
import { catchAsync } from '../lib/catch-async.js';
import { HealthResponseSchema } from '../schemas/health.js';

export const healthRouter = Router();

healthRouter.get(
  '/health',
  catchAsync(async (_req, res) => {
    const payload = HealthResponseSchema.parse({
      status: 'ok',
      service: 'inference',
      timestamp: new Date().toISOString(),
    });
    res.status(200).json(payload);
  }),
);
