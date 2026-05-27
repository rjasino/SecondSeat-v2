import type { RequestHandler } from "express";
import { inferenceConfig } from "../config/config.js";

/**
 * Validates the X-Service-Secret header (shared secret between Next.js and Express)
 * and attaches X-User-Id / X-User-Role to req.user.
 *
 * Next.js reads the iron-session cookie server-side and forwards these headers
 * so the Express service never handles cookie parsing directly.
 */
export const authMiddleware: RequestHandler = (req, res, next) => {
  const secret = req.headers["x-service-secret"];
  if (secret !== inferenceConfig.INFERENCE_SERVICE_SECRET) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or missing service secret" });
    return;
  }

  const userId = req.headers["x-user-id"];
  const role = req.headers["x-user-role"];

  if (!userId || typeof userId !== "string" || !role || typeof role !== "string") {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Missing user identity headers" });
    return;
  }

  req.user = { userId, role };
  next();
};
