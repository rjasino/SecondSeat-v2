import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createHealthServer, buildHealthPayload } from './health.js';

describe('workers health probe', () => {
  const server = createHealthServer();
  let baseUrl = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('buildHealthPayload returns a literal-ok liveness payload', () => {
    const payload = buildHealthPayload();
    expect(payload.status).toBe('ok');
    expect(payload.service).toBe('workers');
    expect(() => new Date(payload.timestamp).toISOString()).not.toThrow();
  });

  it('GET /health returns 200 with the liveness payload', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('workers');
  });

  it('unknown routes return 404', async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
