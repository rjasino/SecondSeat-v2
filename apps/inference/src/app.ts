import express, { type Express } from "express";
import helmet from "helmet";
import { healthRouter } from "./routes/health.js";
import { generateRouter } from "./routes/generate.route.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

export function createApp(): Express {
  const app = express();

  app.use(
    helmet({
      // SSE requires chunked transfer — disable content-length enforcement
      contentSecurityPolicy: false,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  // Health check — no auth required
  app.use("/health", healthRouter);

  // Inference routes — auth required
  app.use("/api/v1/generate", authMiddleware, generateRouter);

  // Centralised error handler — must be last
  app.use(errorMiddleware);

  return app;
}
