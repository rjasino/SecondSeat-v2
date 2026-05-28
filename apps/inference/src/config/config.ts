function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[inference] Required env var missing: ${key}`);
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

type LlmProvider = "anthropic" | "opencode_zen";

function resolveLlmProvider(): LlmProvider {
  const raw = requireEnv("LLM_PROVIDER");
  if (raw !== "anthropic" && raw !== "opencode_zen") {
    throw new Error(
      `[inference] LLM_PROVIDER must be "anthropic" or "opencode_zen", got: "${raw}"`
    );
  }
  return raw;
}

const provider = resolveLlmProvider();

export const inferenceConfig = {
  MONGODB_URI: requireEnv("MONGODB_URI"),
  CHROMA_URL: optionalEnv("CHROMA_URL", "http://localhost:8000"),
  CHROMA_COLLECTION: optionalEnv("CHROMA_COLLECTION", "secondseat_rag"),

  INFERENCE_SERVICE_SECRET: requireEnv("INFERENCE_SERVICE_SECRET"),

  LLM_PROVIDER: provider,
  ANTHROPIC_API_KEY:
    provider === "anthropic" ? requireEnv("ANTHROPIC_API_KEY") : "",
  ANTHROPIC_MODEL:
    provider === "anthropic" ? requireEnv("ANTHROPIC_MODEL") : "",
  // Must terminate at the API version prefix (e.g. https://opencode.ai/zen/v1).
  // The OpenAI SDK appends the route suffix (`/responses`, `/chat/completions`).
  OPENCODE_ZEN_BASE_URL:
    provider === "opencode_zen" ? requireEnv("OPENCODE_ZEN_BASE_URL") : "",
  OPENCODE_ZEN_API_KEY:
    provider === "opencode_zen" ? requireEnv("OPENCODE_ZEN_API_KEY") : "",
  OPENCODE_ZEN_MODEL:
    provider === "opencode_zen" ? requireEnv("OPENCODE_ZEN_MODEL") : "",

  RETRIEVAL_K: parseInt(optionalEnv("RETRIEVAL_K", "4"), 10),
  // RETRIEVAL_MIN_SCORE is cosine similarity (0–1). Converted to max L2 distance
  // via sqrt(2*(1-score)) for normalized vectors (all-MiniLM-L6-v2 outputs are normalized).
  RETRIEVAL_MIN_SCORE: parseFloat(optionalEnv("RETRIEVAL_MIN_SCORE", "0.3")),

  LLM_TIMEOUT_MS: parseInt(optionalEnv("LLM_TIMEOUT_MS", "30000"), 10),

  RATE_LIMIT_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  RATE_LIMIT_MAX: 30,

  PORT: parseInt(optionalEnv("PORT", "3001"), 10),
} as const;

/** Max L2 distance corresponding to RETRIEVAL_MIN_SCORE (cosine) for normalized vectors. */
export const RETRIEVAL_MAX_L2_DISTANCE = Math.sqrt(
  2 * (1 - inferenceConfig.RETRIEVAL_MIN_SCORE)
);
