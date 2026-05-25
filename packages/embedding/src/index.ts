export const EMBEDDING_DIMENSIONS = 384;

export async function embed(_text: string): Promise<number[]> {
  return new Array(EMBEDDING_DIMENSIONS).fill(0);
}
