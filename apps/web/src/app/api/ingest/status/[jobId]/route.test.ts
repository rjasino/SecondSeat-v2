import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db', () => ({ ensureDb: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@secondseat/db', () => ({
  RagIngestionJob: { findById: vi.fn() },
  RagSource: { findById: vi.fn() },
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

import { GET } from './route';
import { getSession } from '@/lib/session';
import { RagIngestionJob, RagSource } from '@secondseat/db';

const mockGetSession = vi.mocked(getSession);
const mockJobFindById = vi.mocked(RagIngestionJob.findById);
const mockSourceFindById = vi.mocked(RagSource.findById);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_JOB_ID = '507f1f77bcf86cd799439011';
const VALID_SOURCE_ID = '507f1f77bcf86cd799439012';
const VALID_USER_ID = '507f1f77bcf86cd799439013';

function makeRequest() {
  return new Request(`http://localhost/api/ingest/status/${VALID_JOB_ID}`);
}

function makeParams(jobId = VALID_JOB_ID) {
  return { params: Promise.resolve({ jobId }) };
}

function makeAuthorSession(userId = VALID_USER_ID) {
  return { user: { userId, role: 'author' as const } };
}

function makeAdminSession() {
  return { user: { userId: VALID_USER_ID, role: 'admin' as const } };
}

function makeJob() {
  return {
    _id: { toString: () => VALID_JOB_ID },
    sourceId: { toString: () => VALID_SOURCE_ID },
    status: 'processing' as const,
    totalChunks: 42,
    processedChunks: 17,
    progress: 40,
    error: null,
    startedAt: new Date('2026-05-26T10:00:00Z'),
    finishedAt: null,
  };
}

function makeSource(createdBy = VALID_USER_ID) {
  return {
    title: 'Water Temple Walkthrough',
    createdBy: { toString: () => createdBy },
  };
}

function withLean(returnValue: unknown) {
  return { lean: () => Promise.resolve(returnValue) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/ingest/status/:jobId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobFindById.mockReturnValue(withLean(makeJob()) as never);
    mockSourceFindById.mockReturnValue({ select: () => withLean(makeSource()) } as never);
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue({ user: undefined } as never);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 404 for invalid ObjectId format', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await GET(makeRequest(), makeParams('not-an-id'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when job does not exist', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    mockJobFindById.mockReturnValue(withLean(null) as never);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 403 when requester does not own the source', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession('aaaaaaaaaaaaaaaaaaaaaaaa') as never);
    mockSourceFindById.mockReturnValue({ select: () => withLean(makeSource(VALID_USER_ID)) } as never);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Access denied');
  });

  it('returns 200 with full job data for the owning author', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession(VALID_USER_ID) as never);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.jobId).toBe(VALID_JOB_ID);
    expect(body.status).toBe('processing');
    expect(body.totalChunks).toBe(42);
    expect(body.processedChunks).toBe(17);
    expect(body.progress).toBe(40);
    expect(body.sourceTitle).toBe('Water Temple Walkthrough');
  });

  it('returns 200 for admin regardless of ownership', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    // Source owned by someone else
    mockSourceFindById.mockReturnValue({ select: () => withLean(makeSource('other-user-00000')) } as never);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  it('returns progress: null and totalChunks: null when not yet set', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession(VALID_USER_ID) as never);
    mockJobFindById.mockReturnValue(withLean({
      ...makeJob(),
      totalChunks: undefined,
      progress: undefined,
      processedChunks: 0,
    }) as never);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.totalChunks).toBeNull();
    expect(body.progress).toBeNull();
  });
});
