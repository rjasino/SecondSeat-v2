import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { HealthResponseSchema } from '../schemas/health.js';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('returns 200 with a schema-valid liveness payload', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('ok');
      expect(parsed.data.service).toBe('inference');
    }
  });

  it('sets helmet security headers', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('emits rate-limit headers (draft-7)', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['ratelimit']).toBeDefined();
  });
});
