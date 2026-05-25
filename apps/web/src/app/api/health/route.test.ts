import { describe, expect, it } from 'vitest';
import { GET } from './route.js';

describe('GET /api/health (web)', () => {
  it('returns 200 with a liveness payload', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('web');
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });
});
