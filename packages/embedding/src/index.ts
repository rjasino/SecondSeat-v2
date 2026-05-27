// @xenova/transformers is ESM-only; dynamic import avoids top-level await issues.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pipeline = (text: string, opts: Record<string, unknown>) => Promise<any>;

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

let _pipeline: Pipeline | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (_pipeline) return _pipeline;

  const { pipeline, env } = await import("@xenova/transformers");

  env.allowLocalModels = true;

  _pipeline = (await pipeline(
    "feature-extraction",
    EMBEDDING_MODEL
  )) as Pipeline;

  // Dimension assertion — hard guard against accidental model swap
  const testOutput = await _pipeline("dimension check", {
    pooling: "mean",
    normalize: true,
  });
  const dims = (testOutput.data as Float32Array).length;
  if (dims !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding model returned ${dims} dimensions, expected ${EMBEDDING_DIMENSIONS}`
    );
  }

  console.log(`[embedding] model loaded: ${EMBEDDING_MODEL} (${dims}-dim)`);

  return _pipeline;
}

export async function embedText(text: string): Promise<number[]> {
  const embed = await getPipeline();
  const start = Date.now();
  const output = await embed(text, { pooling: "mean", normalize: true });
  const ms = Date.now() - start;
  console.log(`[embedding] embedded in ${ms}ms`);
  return Array.from(output.data as Float32Array);
}

export async function warmupEmbeddingModel(): Promise<void> {
  await getPipeline();
}
