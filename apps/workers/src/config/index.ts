import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive(),
  REDIS_URL: z.string().url(),
  MONGODB_URI: z.string().url(),
  CHROMA_URL: z.string().url().default('http://localhost:8000'),
  CHROMA_COLLECTION_NAME: z.string().min(1).default('secondseat_guide_chunks'),
  INGEST_JOB_MAX_RETRIES: z.coerce.number().int().positive().default(3),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid workers config: ${issues}`);
  }
  return parsed.data;
}
