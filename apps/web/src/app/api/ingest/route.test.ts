import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  ensureDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@secondseat/db', () => ({
  RagSource: {
    create: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
  RagIngestionJob: {
    create: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/lib/queue', () => ({
  getIngestionQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: 'bull-job-1' }),
  }),
}));

vi.mock('@/lib/config', () => ({
  loadConfig: vi.fn().mockReturnValue({
    NODE_ENV: 'test',
    WEB_PORT: 3000,
    MONGODB_URI: 'mongodb://localhost:27017/test',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'test-secret-at-least-32-characters!',
    INGEST_MAX_FILE_BYTES: 5_242_880,
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { POST } from './route';
import { getSession } from '@/lib/session';
import { RagSource } from '@secondseat/db';
import { getIngestionQueue } from '@/lib/queue';

const mockGetSession = vi.mocked(getSession);
const mockRagSource = vi.mocked(RagSource);
const mockGetQueue = vi.mocked(getIngestionQueue);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuthorSession() {
  return { user: { userId: '507f1f77bcf86cd799439011', role: 'author' as const } };
}

function makeJsonRequest(body: unknown) {
  return new Request('http://localhost/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeFakeObjectId() {
  return { _id: { toString: () => '507f1f77bcf86cd799439011' }, toString: () => '507f1f77bcf86cd799439011' };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRagSource.create.mockResolvedValue(makeFakeObjectId() as never);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('returns 401 when no session user', async () => {
    mockGetSession.mockResolvedValue({ user: undefined } as never);
    const res = await POST(makeJsonRequest({}));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Not authenticated');
  });

  it('returns 403 when user role is "user"', async () => {
    mockGetSession.mockResolvedValue({
      user: { userId: '507f1f77bcf86cd799439099', role: 'user' as const },
    } as never);
    const res = await POST(makeJsonRequest({}));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Insufficient role');
  });

  // ── Text mode validation ───────────────────────────────────────────────────

  it('returns 422 when title is missing in text mode', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await POST(makeJsonRequest({
      sourceType: 'text',
      content: '<p>content</p>',
      game: 'Zelda',
      area: 'Temple',
      spoilerLevel: 'low',
    }));
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { field: string }[] };
    expect(body.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('returns 422 when content is missing in text mode', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await POST(makeJsonRequest({
      title: 'Guide',
      sourceType: 'text',
      game: 'Zelda',
      area: 'Temple',
      spoilerLevel: 'low',
    }));
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { field: string }[] };
    expect(body.errors.some((e) => e.field === 'content')).toBe(true);
  });

  it('returns 422 when text content converts to empty markdown', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    // Whitespace-only HTML → empty markdown after conversion
    const res = await POST(makeJsonRequest({
      title: 'Guide',
      sourceType: 'text',
      content: '   ',
      game: 'Zelda',
      area: 'Temple',
      spoilerLevel: 'low',
    }));
    expect(res.status).toBe(422);
  });

  // ── Happy path: text mode ──────────────────────────────────────────────────

  it('returns 201 with jobId on valid text mode submission', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await POST(makeJsonRequest({
      title: 'Water Temple Guide',
      sourceType: 'text',
      content: '<h1>Water Temple</h1><p>Go to the north corridor.</p>',
      game: 'Zelda OoT',
      area: 'Water Temple',
      spoilerLevel: 'low',
    }));
    expect(res.status).toBe(201);
    const body = await res.json() as { jobId: string };
    expect(typeof body.jobId).toBe('string');
    expect(body.jobId.length).toBeGreaterThan(0);
  });

  // ── BullMQ failure rollback ────────────────────────────────────────────────

  it('returns 500 and marks source failed when BullMQ enqueue throws', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    mockGetQueue.mockReturnValue({
      add: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
    } as never);

    const res = await POST(makeJsonRequest({
      title: 'Water Temple Guide',
      sourceType: 'text',
      content: '<p>Go north.</p>',
      game: 'Zelda OoT',
      area: 'Water Temple',
      spoilerLevel: 'low',
    }));

    expect(res.status).toBe(500);
    expect(mockRagSource.findByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { status: 'failed' },
    );
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Failed to enqueue ingestion job');
  });

  // ── Unsupported content-type ───────────────────────────────────────────────

  it('returns 422 for unsupported content-type', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await POST(
      new Request('http://localhost/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'raw text',
      }),
    );
    expect(res.status).toBe(422);
  });
});
