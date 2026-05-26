import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_PORT: z.coerce.number().int().positive(),
  MONGODB_URI: z.string().url('MONGODB_URI must be a valid URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  INGEST_MAX_FILE_BYTES: z.coerce.number().int().positive().default(5_242_880), // 5 MB
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid web config: ${issues}`);
  }
  return parsed.data;
}
