import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

export const EMBEDDING_DIMENSIONS = 384;
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

// ─── Singleton ────────────────────────────────────────────────────────────────

let _modelPromise: Promise<FeatureExtractionPipeline> | null = null;

function getModel(): Promise<FeatureExtractionPipeline> {
  if (!_modelPromise) {
    console.log(`[embedding] Loading model ${MODEL_ID}…`);
    _modelPromise = pipeline('feature-extraction', MODEL_ID) as Promise<FeatureExtractionPipeline>;
    _modelPromise.catch(() => {
      // reset so the next call retries after a load failure
      _modelPromise = null;
    });
  }
  return _modelPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Embed a text string using all-MiniLM-L6-v2.
 *
 * The model is loaded once (singleton) and reused across all calls. Concurrent
 * callers before the first load completes all await the same promise.
 *
 * @returns 384-dimensional float array (mean-pooled, normalised)
 */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getModel();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  // output.data is a Float32Array; convert to a plain number[]
  return Array.from(output.data as Float32Array);
}
