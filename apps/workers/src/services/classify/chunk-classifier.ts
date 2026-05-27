export type ChunkContentType =
  | "full_walkthrough"
  | "area_guide"
  | "boss_guide"
  | "side_quest_guide"
  | "collectibles_guide"
  | "tips_and_tricks"
  | "game_guide"
  | "character_arc"
  | "general";

export interface ClassificationResult {
  contentType: ChunkContentType;
  chapterNumber: number | null;
}

const CHAPTER_RE = /(chapter|act|part|section|stage)\s*(\d+)/i;

// Priority-ordered: first match wins.
const RULES: Array<{ pattern: RegExp; type: ChunkContentType }> = [
  { pattern: /\b(boss|fight|battle|combat|encounter)\b/i, type: "boss_guide" },
  {
    pattern: /\b(side[\s-]?quest|sidequest|optional quest|optional mission)\b/i,
    type: "side_quest_guide",
  },
  {
    pattern: /\b(collectible|trophy|achievement|item location|pickup)\b/i,
    type: "collectibles_guide",
  },
  {
    pattern: /\b(tips?|tricks?|hints?|strateg(y|ies)|mechanics?|exploit)/i,
    type: "tips_and_tricks",
  },
  {
    pattern: /\b(character|npc|lore|story|narrative|backstory|arc)\b/i,
    type: "character_arc",
  },
  { pattern: /\b(area|zone|region|location|map)\b/i, type: "area_guide" },
  {
    pattern: /\b(walkthrough|playthrough|complete guide|full guide)\b/i,
    type: "full_walkthrough",
  },
  {
    pattern: /\b(guide|faq|overview|introduction|getting started)\b/i,
    type: "game_guide",
  },
];

export function classifyChunk(
  headingPath: string,
  contentSnippet: string
): ClassificationResult {
  const subject = `${headingPath} ${contentSnippet.slice(0, 200)}`;

  const chapterMatch = CHAPTER_RE.exec(subject);
  const chapterNumber = chapterMatch
    ? parseInt(chapterMatch[2] ?? "0", 10)
    : null;

  for (const rule of RULES) {
    if (rule.pattern.test(subject)) {
      return { contentType: rule.type, chapterNumber };
    }
  }

  return { contentType: "general", chapterNumber };
}
