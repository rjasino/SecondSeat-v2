function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Required env var missing: ${key}`);
  return val;
}

export const config = {
  MONGO_URL: requireEnv("MONGO_URL"),
  REDIS_URL: requireEnv("REDIS_URL"),
  INGEST_QUEUE_NAME: process.env["INGEST_QUEUE_NAME"] ?? "ingestion",
  CHROMA_URL: process.env["CHROMA_URL"] ?? "http://localhost:8000",
  CHROMA_COLLECTION: process.env["CHROMA_COLLECTION"] ?? "secondseat_rag",
  EMBEDDING_MODEL: process.env["EMBEDDING_MODEL"] ?? "Xenova/all-MiniLM-L6-v2",
  WORKERS_HEALTH_PORT: parseInt(process.env["WORKERS_HEALTH_PORT"] ?? "4100", 10),
} as const;
