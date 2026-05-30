import { z } from "zod";

export const objectIdRegex = /^[a-f\d]{24}$/i;

export const objectId = z
  .string()
  .regex(objectIdRegex, "Must be a valid MongoDB ObjectId");

/**
 * Reserved `subArea` value meaning "no sub-area / whole area". Required at the
 * boundary, but the inference retrieval layer drops it so it never narrows the
 * location filter. Kept here so the UI and the Route Handlers agree on it.
 */
export const SUBAREA_NONE = "none";

/** The editable run-context fields a player supplies on the Request Screen. */
export const runContextFieldsSchema = z.object({
  gameArea: z.string().min(1).max(100),
  chapter: z.string().min(1).max(100).optional(),
  subArea: z.string().min(1).max(100),
  playerGoal: z.enum([
    "progression",
    "exploration",
    "confirmation",
    "completion",
  ]),
  confidenceLevel: z.enum(["confident", "uncertain", "stuck"]),
});

export type RunContextFields = z.infer<typeof runContextFieldsSchema>;

/**
 * Start-of-game defaults persisted when a player begins a NEW run. The Request
 * Screen opens blank and forces the player to fill area + sub-area before the
 * first hint; these values just satisfy the required model fields until then.
 */
export const START_OF_GAME_CONTEXT: RunContextFields = {
  gameArea: "Start",
  subArea: SUBAREA_NONE,
  playerGoal: "progression",
  confidenceLevel: "uncertain",
};
