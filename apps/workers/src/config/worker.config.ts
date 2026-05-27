function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Required env var missing: ${key}`);
  return val;
}

export const workerConfig = {
  MONGO_URL: requireEnv("MONGO_URL"),
  REDIS_URL: requireEnv("REDIS_URL"),
  INGEST_UPLOAD_DIR: requireEnv("INGEST_UPLOAD_DIR"),
  INGEST_QUEUE_NAME: process.env["INGEST_QUEUE_NAME"] ?? "ingestion",
  DELETE_QUEUE_NAME: process.env["DELETE_QUEUE_NAME"] ?? "delete-source",
  DELETE_QUEUE_ATTEMPTS: parseInt(
    process.env["DELETE_QUEUE_ATTEMPTS"] ?? "3",
    10
  ),
  CHROMA_URL: process.env["CHROMA_URL"] ?? "http://localhost:8000",
  CHROMA_COLLECTION: process.env["CHROMA_COLLECTION"] ?? "secondseat_rag",
  EMBEDDING_MODEL:
    process.env["EMBEDDING_MODEL"] ?? "Xenova/all-MiniLM-L6-v2",
  EMBEDDING_DIMENSIONS: parseInt(
    process.env["EMBEDDING_DIMENSIONS"] ?? "384",
    10
  ),
} as const;
