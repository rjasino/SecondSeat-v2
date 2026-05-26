import express, { type Express } from 'express';
import helmet from 'helmet';
import { baseRateLimiter } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(baseRateLimiter);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', healthRouter);

  app.use(errorHandler);

  return app;
}
