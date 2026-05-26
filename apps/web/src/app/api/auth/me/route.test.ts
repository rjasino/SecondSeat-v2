import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/user', () => ({
  getUserById: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { GET } from './route';
import { getSession } from '@/lib/session';
import { getUserById } from '@/lib/user';

const mockGetSession = vi.mocked(getSession);
const mockGetUserById = vi.mocked(getUserById);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(user?: { userId: string; role: 'user' | 'author' | 'admin' }) {
  return { user, destroy: vi.fn() };
}

function makeProfile() {
  return {
    userId: '507f1f77bcf86cd799439011',
    name: 'Player One',
    email: 'player@example.com',
    role: 'user' as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns 200 { userId, name, email, role } for a valid session', async () => {
    mockGetSession.mockResolvedValue(
      makeSession({ userId: '507f1f77bcf86cd799439011', role: 'user' }) as never,
    );
    mockGetUserById.mockResolvedValue(makeProfile());

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      userId: '507f1f77bcf86cd799439011',
      name: 'Player One',
      email: 'player@example.com',
      role: 'user',
    });
  });

  it('returns 401 { error: "unauthenticated" } when there is no session', async () => {
    mockGetSession.mockResolvedValue(makeSession(undefined) as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'unauthenticated' });
  });

  it('returns 401 and destroys session when user document has been deleted', async () => {
    const session = makeSession({ userId: '507f1f77bcf86cd799439011', role: 'user' });
    mockGetSession.mockResolvedValue(session as never);
    mockGetUserById.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'unauthenticated' });
    expect(session.destroy).toHaveBeenCalledOnce();
  });
});
