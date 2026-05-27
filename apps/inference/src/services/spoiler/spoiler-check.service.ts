import { SPOILER_KEYWORDS } from "./keywords.js";

/**
 * Fast keyword pre-check run before the LLM call.
 * Returns true if the query contains a known spoiler keyword.
 * Case-insensitive, whole-word not required (substring match is intentional
 * — "ending" catches "what is the ending").
 */
export function checkKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SPOILER_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}
