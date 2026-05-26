import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db', () => ({ ensureDb: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@secondseat/db', () => ({
  RagSource: {
    findById: vi.fn(),
  },
}));

vi.mock('@/lib/queue', () => ({
  getDeleteSourceQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: 'bull-job-42' }),
  }),
}));

vi.mock('@/lib/config', () => ({
  loadConfig: vi.fn().mockReturnValue({ REDIS_URL: 'redis://localhost:6379' }),
}));

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      isValidObjectId: (id: string) => /^[a-f\d]{24}$/i.test(id),
    },
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { GET, DELETE } from './route';
import { getSession } from '@/lib/session';
import { RagSource } from '@secondseat/db';
import { getDeleteSourceQueue } from '@/lib/queue';

const mockGetSession = vi.mocked(getSession);
const mockRagSource = vi.mocked(RagSource);
const mockGetQueue = vi.mocked(getDeleteSourceQueue);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SOURCE_ID = '507f1f77bcf86cd799439012';
const VALID_USER_ID = '507f1f77bcf86cd799439013';

function makeParams(sourceId = VALID_SOURCE_ID) {
  return { params: Promise.resolve({ sourceId }) };
}

function makeRequest(method: string) {
  return new Request(`http://localhost/api/ingest/sources/${VALID_SOURCE_ID}`, { method });
}

function makeAdminSession() {
  return { user: { userId: VALID_USER_ID, role: 'admin' as const } };
}

function makeAuthorSession(userId = VALID_USER_ID) {
  return { user: { userId, role: 'author' as const } };
}

function makeSource(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => VALID_SOURCE_ID },
    title: 'Test Source',
    status: 'completed',
    sourceType: 'text',
    metadata: { game: 'Zelda', area: 'Temple', spoilerLevel: 'low' },
    createdBy: { toString: () => VALID_USER_ID },
    createdAt: new Date('2026-01-01'),
    previousStatus: null,
    save: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/ingest/sources/:sourceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // GET uses .select().lean() chain — mock accordingly
    mockRagSource.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(makeSource()),
      }),
    } as never);
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue({ user: undefined } as never);
    const res = await GET(makeRequest('GET'), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is user', async () => {
    mockGetSession.mockResolvedValue({ user: { userId: VALID_USER_ID, role: 'user' } } as never);
    const res = await GET(makeRequest('GET'), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 404 for invalid ObjectId', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await GET(makeRequest('GET'), makeParams('bad-id'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when source does not exist', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    mockRagSource.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    } as never);
    const res = await GET(makeRequest('GET'), makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 403 when author does not own source', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession('aaaaaaaaaaaaaaaaaaaaaaaa') as never);
    const res = await GET(makeRequest('GET'), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 200 with source data for the owner', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await GET(makeRequest('GET'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as { sourceId: string; status: string };
    expect(body.sourceId).toBe(VALID_SOURCE_ID);
    expect(body.status).toBe('completed');
  });

  it('returns 200 for admin regardless of ownership', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    mockRagSource.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(makeSource({ createdBy: { toString: () => 'bbbbbbbbbbbbbbbbbbbbbbbb' } })),
      }),
    } as never);
    const res = await GET(makeRequest('GET'), makeParams());
    expect(res.status).toBe(200);
  });
});

// ─── DELETE tests ─────────────────────────────────────────────────────────────

describe('DELETE /api/ingest/sources/:sourceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRagSource.findById.mockResolvedValue(makeSource() as never);
    mockGetQueue.mockReturnValue({
      add: vi.fn().mockResolvedValue({ id: 'bull-job-42' }),
    } as never);
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue({ user: undefined } as never);
    const res = await DELETE(makeRequest('DELETE'), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is author (not admin)', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await DELETE(makeRequest('DELETE'), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 404 for invalid ObjectId', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    const res = await DELETE(makeRequest('DELETE'), makeParams('bad-id'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when source does not exist', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    mockRagSource.findById.mockResolvedValue(null as never);
    const res = await DELETE(makeRequest('DELETE'), makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 409 when source is processing', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    mockRagSource.findById.mockResolvedValue(makeSource({ status: 'processing' }) as never);
    const res = await DELETE(makeRequest('DELETE'), makeParams());
    expect(res.status).toBe(409);
  });

  it('returns 202 idempotently when already deleting', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    mockRagSource.findById.mockResolvedValue(makeSource({ status: 'deleting' }) as never);
    const res = await DELETE(makeRequest('DELETE'), makeParams());
    expect(res.status).toBe(202);
    // No job enqueued for idempotent path
    expect(mockGetQueue).not.toHaveBeenCalled();
  });

  it('returns 202 with jobId and enqueues delete-source job', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    const source = makeSource();
    mockRagSource.findById.mockResolvedValue(source as never);

    const res = await DELETE(makeRequest('DELETE'), makeParams());
    expect(res.status).toBe(202);
    const body = await res.json() as { jobId: string };
    expect(body.jobId).toBe('bull-job-42');
  });

  it('sets status to deleting and saves previousStatus before enqueuing', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    const source = makeSource({ status: 'completed' });
    mockRagSource.findById.mockResolvedValue(source as never);

    await DELETE(makeRequest('DELETE'), makeParams());

    expect(source.status).toBe('deleting');
    expect(source.previousStatus).toBe('completed');
    expect(source.save).toHaveBeenCalled();
  });
});
