import { z } from "zod";

export const ALLOWED_EXTENSIONS = [
  ".md",
  ".markdown",
  ".html",
  ".htm",
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const uploadFileSchema = z.object({
  name: z.string().min(1),
  size: z.number().positive(),
});

export const sourceListQuerySchema = z.object({
  cursor: z.string().optional(),
});

export const jobStatusParamsSchema = z.object({
  jobId: z.string().min(1),
});

export const sourceIdParamsSchema = z.object({
  sourceId: z.string().min(1),
});

export const GUIDE_TYPE_VALUES = [
  "full_walkthrough",
  "game_guide",
  "area_guide",
  "boss_guide",
  "side_quest_guide",
  "collectibles_guide",
  "tips_and_tricks",
] as const;

export type GuideType = (typeof GUIDE_TYPE_VALUES)[number];

export const GUIDE_TYPE_LABELS: Record<GuideType, string> = {
  full_walkthrough: "Full Walkthrough",
  game_guide: "Game Guide",
  area_guide: "Area Guide",
  boss_guide: "Boss Guide",
  side_quest_guide: "Side Quest Guide",
  collectibles_guide: "Collectibles Guide",
  tips_and_tricks: "Tips & Tricks",
};

export const DRAFT_CHAR_LIMIT = 50_000;

export const uploadMetaSchema = z.object({
  game: z.string().min(1).max(100),
  guideType: z.enum(GUIDE_TYPE_VALUES),
  author: z.string().min(1).max(200),
});

export const createDraftSchema = z.object({
  title: z.string().min(1).max(200),
  game: z.string().min(1).max(100),
  guideType: z.enum(GUIDE_TYPE_VALUES),
  author: z.string().min(1).max(200),
  content: z.string().max(DRAFT_CHAR_LIMIT).optional(),
});

export const updateDraftSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  game: z.string().min(1).max(100).optional(),
  guideType: z.enum(GUIDE_TYPE_VALUES).optional(),
  author: z.string().min(1).max(200).optional(),
  content: z.string().max(DRAFT_CHAR_LIMIT).optional(),
});

export const draftSourceIdParamsSchema = z.object({
  sourceId: z.string().min(1),
});
