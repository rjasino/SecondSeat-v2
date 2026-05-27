import rateLimit from "express-rate-limit";
import { inferenceConfig } from "../config/config.js";

export const generateRateLimiter = rateLimit({
  windowMs: inferenceConfig.RATE_LIMIT_WINDOW_MS,
  max: inferenceConfig.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? req.ip ?? "unknown",
  message: {
    error: "RATE_LIMITED",
    message: "Too many hint requests — please wait a moment before asking again.",
  },
});
