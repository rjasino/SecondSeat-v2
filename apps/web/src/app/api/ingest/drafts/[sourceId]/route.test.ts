import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db', () => ({ ensureDb: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/turndown', () => ({ htmlToMarkdown: vi.fn((h: string) => h) }));

vi.mock('@secondseat/db', () => ({
  RagSource: {
    findById: vi.fn(),
    findByIdAndDelete: vi.fn().mockResolvedValue(null),
  },
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

import { DELETE, PATCH } from './route';
import { getSession } from '@/lib/session';
import { RagSource } from '@secondseat/db';

const mockGetSession = vi.mocked(getSession);
const mockRagSource = vi.mocked(RagSource);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SOURCE_ID = '507f1f77bcf86cd799439012';
const VALID_USER_ID = '507f1f77bcf86cd799439013';

function makeParams(sourceId = VALID_SOURCE_ID) {
  return { params: Promise.resolve({ sourceId }) };
}

function makeRequest(method: string, body?: unknown) {
  return new Request(`http://localhost/api/ingest/drafts/${VALID_SOURCE_ID}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeAdminSession() {
  return { user: { userId: VALID_USER_ID, role: 'admin' as const } };
}

function makeAuthorSession(userId = VALID_USER_ID) {
  return { user: { userId, role: 'author' as const } };
}

function makeDraftSource(createdBy = VALID_USER_ID) {
  return {
    _id: { toString: () => VALID_SOURCE_ID },
    title: 'Draft Title',
    status: 'draft',
    content: 'existing content',
    createdBy: { toString: () => createdBy },
    metadata: { game: 'Zelda', area: 'Temple', spoilerLevel: 'low' },
    save: vi.fn().mockResolvedValue(null),
  };
}

// ─── DELETE tests ─────────────────────────────────────────────────────────────

describe('DELETE /api/ingest/drafts/:sourceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRagSource.findById.mockResolvedValue(makeDraftSource() as never);
    mockRagSource.findByIdAndDelete.mockResolvedValue(null as never);
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

  it('returns 404 for invalid ObjectId format', async () => {
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

  it('returns 409 when source status is not draft', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    mockRagSource.findById.mockResolvedValue({
      ...makeDraftSource(),
      status: 'completed',
    } as never);
    const res = await DELETE(makeRequest('DELETE'), makeParams());
    expect(res.status).toBe(409);
  });

  it('returns 204 and hard-deletes on valid draft delete', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    const res = await DELETE(makeRequest('DELETE'), makeParams());
    expect(res.status).toBe(204);
    expect(mockRagSource.findByIdAndDelete).toHaveBeenCalledWith(VALID_SOURCE_ID);
  });
});

// ─── PATCH tests ──────────────────────────────────────────────────────────────

describe('PATCH /api/ingest/drafts/:sourceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRagSource.findById.mockResolvedValue(makeDraftSource() as never);
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue({ user: undefined } as never);
    const res = await PATCH(makeRequest('PATCH', { title: 'New Title' }), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 403 for insufficient role (user)', async () => {
    mockGetSession.mockResolvedValue({ user: { userId: VALID_USER_ID, role: 'user' } } as never);
    const res = await PATCH(makeRequest('PATCH', { title: 'New Title' }), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 404 for invalid ObjectId format', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const res = await PATCH(makeRequest('PATCH', { title: 'x' }), makeParams('bad-id'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when source does not exist', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    mockRagSource.findById.mockResolvedValue(null as never);
    const res = await PATCH(makeRequest('PATCH', { title: 'x' }), makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 403 when author does not own the source', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession('aaaaaaaaaaaaaaaaaaaaaaaa') as never);
    mockRagSource.findById.mockResolvedValue(makeDraftSource(VALID_USER_ID) as never);
    const res = await PATCH(makeRequest('PATCH', { title: 'x' }), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 409 when source is not a draft', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    mockRagSource.findById.mockResolvedValue({
      ...makeDraftSource(),
      status: 'completed',
    } as never);
    const res = await PATCH(makeRequest('PATCH', { title: 'x' }), makeParams());
    expect(res.status).toBe(409);
  });

  it('returns 204 and saves updates on valid patch', async () => {
    mockGetSession.mockResolvedValue(makeAuthorSession() as never);
    const source = makeDraftSource();
    mockRagSource.findById.mockResolvedValue(source as never);
    const res = await PATCH(makeRequest('PATCH', { title: 'Updated Title' }), makeParams());
    expect(res.status).toBe(204);
    expect(source.save).toHaveBeenCalled();
  });

  it('allows admin to patch a source they do not own', async () => {
    mockGetSession.mockResolvedValue(makeAdminSession() as never);
    mockRagSource.findById.mockResolvedValue(
      makeDraftSource('bbbbbbbbbbbbbbbbbbbbbbbb') as never,
    );
    const res = await PATCH(makeRequest('PATCH', { title: 'Admin Edit' }), makeParams());
    expect(res.status).toBe(204);
  });
});
