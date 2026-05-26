import { z } from 'zod';

// ─── Shared ───────────────────────────────────────────────────────────────────

export const ALLOWED_EXTENSIONS = ['.md', '.html'] as const;
export const ALLOWED_MIME_TYPES = ['text/markdown', 'text/plain', 'text/html'] as const;
export const SPOILER_LEVELS = ['none', 'low', 'medium', 'high'] as const;

// ─── File mode schema (parsed from FormData flat fields) ─────────────────────

export const fileIngestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  sourceType: z.literal('file'),
  game: z.string().min(1, 'Game is required'),
  area: z.string().min(1, 'Area is required'),
  spoilerLevel: z.enum(SPOILER_LEVELS, {
    errorMap: () => ({ message: 'spoilerLevel must be none | low | medium | high' }),
  }),
});

export type FileIngestFields = z.infer<typeof fileIngestSchema>;

// ─── Text mode schema (parsed from JSON body) ─────────────────────────────────

export const textIngestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  sourceType: z.literal('text'),
  content: z.string().min(1, 'Content is required'),
  game: z.string().min(1, 'Game is required'),
  area: z.string().min(1, 'Area is required'),
  spoilerLevel: z.enum(SPOILER_LEVELS, {
    errorMap: () => ({ message: 'spoilerLevel must be none | low | medium | high' }),
  }),
});

export type TextIngestFields = z.infer<typeof textIngestSchema>;

// ─── Shared error response helper ─────────────────────────────────────────────

export function formatZodErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}
