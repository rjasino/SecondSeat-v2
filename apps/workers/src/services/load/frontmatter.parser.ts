import { z } from "zod";
import type { ChunkContentType } from "../classify/chunk-classifier.js";

const CONTENT_TYPES = [
  "full_walkthrough",
  "area_guide",
  "boss_guide",
  "enemy_reference",
  "side_quest_guide",
  "collectibles_guide",
  "tips_and_tricks",
  "game_guide",
  "character_arc",
  "general",
] as const;

const contentTypeSchema = z.enum(CONTENT_TYPES);
const spoilerLevelSchema = z
  .coerce.number()
  .pipe(z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]));
const defaultAreaSchema = z.string().min(1).max(200);

export interface ParsedFrontmatter {
  contentType?: ChunkContentType;
  spoilerLevel?: 0 | 1 | 2 | 3;
  defaultArea?: string;
}

export interface FrontmatterParseResult {
  frontmatter: ParsedFrontmatter;
  body: string;
}

export function parseFrontmatter(
  content: string,
  filename = "unknown"
): FrontmatterParseResult {
  if (!content.startsWith("---\n")) {
    return { frontmatter: {}, body: content };
  }

  const afterOpen = content.slice(4);
  const closeMatch = /^---\s*$/m.exec(afterOpen);

  if (!closeMatch) {
    console.warn(
      `[frontmatter] unclosed frontmatter block in ${filename} — treating whole file as body`
    );
    return { frontmatter: {}, body: content };
  }

  const blockText = afterOpen.slice(0, closeMatch.index);
  const rawBody = afterOpen.slice(closeMatch.index + closeMatch[0]!.length);
  const body = rawBody.startsWith("\n") ? rawBody.slice(1) : rawBody;

  // Parse key: value lines (one per line; unknown keys silently ignored)
  const raw: Record<string, string> = {};
  for (const line of blockText.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) raw[key] = value;
  }

  const frontmatter: ParsedFrontmatter = {};

  if (raw["content_type"] !== undefined) {
    const result = contentTypeSchema.safeParse(raw["content_type"]);
    if (result.success) {
      frontmatter.contentType = result.data;
    } else {
      console.warn(
        `[frontmatter] invalid content_type "${raw["content_type"]}" in ${filename} — dropped`
      );
    }
  }

  if (raw["spoiler_level"] !== undefined) {
    const result = spoilerLevelSchema.safeParse(raw["spoiler_level"]);
    if (result.success) {
      frontmatter.spoilerLevel = result.data;
    } else {
      console.warn(
        `[frontmatter] invalid spoiler_level "${raw["spoiler_level"]}" in ${filename} — dropped`
      );
    }
  }

  if (raw["default_area"] !== undefined) {
    const normalized = raw["default_area"].trim().slice(0, 200).toLowerCase();
    const result = defaultAreaSchema.safeParse(normalized);
    if (result.success) {
      frontmatter.defaultArea = result.data;
    } else {
      console.warn(
        `[frontmatter] invalid default_area "${raw["default_area"]}" in ${filename} — dropped`
      );
    }
  }

  return { frontmatter, body };
}
