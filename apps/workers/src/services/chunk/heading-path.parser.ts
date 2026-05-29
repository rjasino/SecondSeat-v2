/**
 * Parses a chunk's `headingPath` into structured location metadata that
 * inference can use as a soft Chroma `where` filter.
 *
 * Positional mapping (per SPEC-context-aware-retrieval, Story 2):
 *   segment[0] -> route
 *   segment[1] -> chapter
 *   segment[2] -> area
 *   segment[3] -> sub_area
 *
 * Deeper segments are dropped for v1. Missing segments are simply omitted
 * from the returned object (never written as empty strings).
 *
 * All present values are trimmed and lowercased so the inference-side
 * `where` clause can use exact equality against the same normalization.
 */
export interface ParsedHeadingPath {
  route?: string;
  chapter?: string;
  area?: string;
  sub_area?: string;
}

const SEPARATOR = " > ";
const MAX_FIELD_LENGTH = 200;

const FIELDS = ["route", "chapter", "area", "sub_area"] as const;

function normalizeSegment(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, MAX_FIELD_LENGTH).toLowerCase();
}

export function parseHeadingPath(headingPath: string): ParsedHeadingPath {
  if (!headingPath || headingPath.trim().length === 0) return {};

  const segments = headingPath.split(SEPARATOR);
  const result: ParsedHeadingPath = {};

  for (let i = 0; i < Math.min(segments.length, FIELDS.length); i++) {
    const normalized = normalizeSegment(segments[i] ?? "");
    if (normalized !== undefined) {
      result[FIELDS[i]!] = normalized;
    }
  }

  return result;
}
