import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: "VALIDATION_ERROR",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof LlmError) {
    res.status(502).json({
      error: "LLM_ERROR",
      message:
        process.env["NODE_ENV"] === "production"
          ? "The hint service is temporarily unavailable."
          : err.message,
    });
    return;
  }

  console.error("[inference] Unhandled error:", err);
  res.status(500).json({
    error: "INTERNAL_ERROR",
    message:
      process.env["NODE_ENV"] === "production"
        ? "An unexpected error occurred."
        : String(err),
  });
};
