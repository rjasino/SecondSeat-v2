import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db', () => ({ ensureDb: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@secondseat/db', () => ({
  RagSource: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
  RagIngestionJob: {
    create: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/lib/queue', () => ({
  getIngestionQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: 'bull-job-99' }),
  }),
}));

vi.mock('@/lib/config', () => ({
  loadConfig: vi.fn().mockReturnValue({
    REDIS_URL: 'redis://localhost:6379',
    INGEST_JOB_MAX_RETRIES: 3,
    INGEST_JOB_BACKOFF_MS: 5_000,
  }),
}));

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      isValidObjectId: (id: string) => /^[a-f\d]{24}$/i.test(id),
      Types: {
        ...actual.default.Types,
        ObjectId: class {
          private val: string;
          constructor() { this.val = '507f191e810c19729de860ea'; }
          toString() { return this.val; }
        },
      },
    },
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { PATCH } from './route';
import { getSession } from '@/lib/session';
import { RagSource, RagIngestionJob } from '@secondseat/db';
import { getIngestionQueue } from '@/lib/queue';

const mockGetSession = vi.mocked(getSession);
const mockRagSource = vi.mocked(RagSource);
const mockRagIngestionJob = vi.mocked(RagIngestionJob);
const mockGetQueue = vi.mocked(getIngestionQueue);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SOURCE_ID = '507f1f77bcf86cd799439012';
const VALID_USER_ID = '507f1f77bcf86cd799439013';

function makeParams(sourceId = VALID_SOURCE_ID) {
  return { params: Promise.resolve({ sourceId }) };
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/ingest/${VALID_SOURCE_ID}/retry`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeAuthorSession(userId = VALID_USER_ID) {
  return { user: { userId, role: 'author' as const } };
}

function makeAdminSession() {
  return { user: { userId: VALID_USER_ID, role: 'admin' as const } };
}

function makeFailedSource(createdBy = VALID_USER_ID) {
  return {
    _id: { toString: () => VALID_SOURCE_ID },
    title: 'Old Title',
    status: 'failed',
    createdBy: { toString: () => createdBy },
    metadata: { game: 'Zelda', area: 'Temple', spoilerLevel: 'low' },
    save: vi.fn().mockResolvedValue(null),
  };
}

function validBody() {
  return {
    title: 'Corrected Title',
    content: '<h1>Fixed Content</h1><p>Walk north.</p>',
    metadata: { game: 'Zelda OoT', area: 'Water Temple', spoilerLevel: 'low' },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PATCH /api/ingest/:sourceId/retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRagSource.findById.mockResolvedValue(makeFailedSource() as never);
    mockGetQueue.mockReturnValue({
      add: vi.fn().mockResolvedValue({ id: 'bull-job-99' }),
    } as never);
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue({ user: undefined } as never);
    const res = await PATCH(makeRequest(validBody()), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 404 for invalid ObjectId format', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await PATCH(makeRequest(validBody()), makeParams('bad-id'));
    expect(res.status).toBe(404);
  });

  it('returns 422 when title is missing', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await PATCH(makeRequest({ ...validBody(), title: '' }), makeParams());
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { field: string }[] };
    expect(body.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('returns 422 when content is missing', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await PATCH(makeRequest({ ...validBody(), content: '' }), makeParams());
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { field: string }[] };
    expect(body.errors.some((e) => e.field === 'content')).toBe(true);
  });

  it('returns 404 when source does not exist', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    mockRagSource.findById.mockResolvedValue(null as never);
    const res = await PATCH(makeRequest(validBody()), makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 403 when user does not own the source', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession('aaaaaaaaaaaaaaaaaaaaaaaa') as never);
    mockRagSource.findById.mockResolvedValue(makeFailedSource(VALID_USER_ID) as never);
    const res = await PATCH(makeRequest(validBody()), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 409 when source is not in failed state', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    mockRagSource.findById.mockResolvedValue({
      ...makeFailedSource(),
      status: 'queued',
    } as never);
    const res = await PATCH(makeRequest(validBody()), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Source is not in a failed state');
  });

  it('returns 201 with new jobId on valid retry', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await PATCH(makeRequest(validBody()), makeParams());
    expect(res.status).toBe(201);
    const body = await res.json() as { jobId: string };
    expect(typeof body.jobId).toBe('string');
    expect(body.jobId.length).toBeGreaterThan(0);
  });

  it('saves updated source and creates a new job document', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const source = makeFailedSource();
    mockRagSource.findById.mockResolvedValue(source as never);

    await PATCH(makeRequest(validBody()), makeParams());

    expect(source.save).toHaveBeenCalled();
    expect(mockRagIngestionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', processedChunks: 0 }),
    );
  });

  it('returns 500 and rolls back source when BullMQ enqueue throws', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    mockGetQueue.mockReturnValue({
      add: vi.fn().mockRejectedValue(new Error('Redis down')),
    } as never);

    const res = await PATCH(makeRequest(validBody()), makeParams());
    expect(res.status).toBe(500);
    expect(mockRagSource.findByIdAndUpdate).toHaveBeenCalledWith(
      VALID_SOURCE_ID,
      { status: 'failed' },
    );
  });

  it('allows admin to retry a source they do not own', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    mockRagSource.findById.mockResolvedValue(makeFailedSource('bbbbbbbbbbbbbbbbbbbbbbbb') as never);
    const res = await PATCH(makeRequest(validBody()), makeParams());
    expect(res.status).toBe(201);
  });
});
