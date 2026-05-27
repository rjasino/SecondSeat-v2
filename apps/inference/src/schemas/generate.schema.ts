import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

export const generateSchema = z.object({
  playSessionId: z
    .string()
    .regex(objectIdRegex, "Must be a valid MongoDB ObjectId"),
  runContextId: z
    .string()
    .regex(objectIdRegex, "Must be a valid MongoDB ObjectId"),
  gameId: z
    .string()
    .regex(objectIdRegex, "Must be a valid MongoDB ObjectId"),
  gameArea: z.string().min(1).max(100),
  chapter: z.string().min(1).max(100),
  subArea: z.string().min(1).max(100).optional(),
  playerGoal: z.enum(["progression", "exploration", "confirmation", "completion"]),
  confidenceLevel: z.enum(["confident", "uncertain", "stuck"]),
  text: z.string().min(1).max(500),
});

export type GenerateRequest = z.infer<typeof generateSchema>;
