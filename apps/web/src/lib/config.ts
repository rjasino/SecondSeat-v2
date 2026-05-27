import { existsSync, accessSync, constants } from "fs";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Required env var missing: ${key}`);
  return val;
}

const INGEST_UPLOAD_DIR = requireEnv("INGEST_UPLOAD_DIR");

if (!existsSync(INGEST_UPLOAD_DIR)) {
  throw new Error(`INGEST_UPLOAD_DIR not found: ${INGEST_UPLOAD_DIR}`);
}
try {
  accessSync(INGEST_UPLOAD_DIR, constants.W_OK);
} catch {
  throw new Error(`INGEST_UPLOAD_DIR not writable: ${INGEST_UPLOAD_DIR}`);
}

export const config = {
  MONGO_URL: requireEnv("MONGO_URL"),
  REDIS_URL: requireEnv("REDIS_URL"),
  SESSION_PASSWORD: requireEnv("SESSION_PASSWORD"),
  INGEST_UPLOAD_DIR,
  INGEST_MAX_FILE_BYTES: parseInt(
    process.env["INGEST_MAX_FILE_BYTES"] ?? "5242880",
    10
  ),
  INGEST_QUEUE_NAME: process.env["INGEST_QUEUE_NAME"] ?? "ingestion",
  DELETE_QUEUE_NAME: process.env["DELETE_QUEUE_NAME"] ?? "delete-source",
  DELETE_QUEUE_ATTEMPTS: parseInt(
    process.env["DELETE_QUEUE_ATTEMPTS"] ?? "3",
    10
  ),
  CHROMA_URL: process.env["CHROMA_URL"] ?? "http://localhost:8000",
  CHROMA_COLLECTION: process.env["CHROMA_COLLECTION"] ?? "secondseat_rag",
  GAME_ID: process.env["GAME_ID"] ?? "default",
  INFERENCE_URL: requireEnv("INFERENCE_URL"),
  INFERENCE_SERVICE_SECRET: requireEnv("INFERENCE_SERVICE_SECRET"),
} as const;
