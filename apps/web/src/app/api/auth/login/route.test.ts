import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  ensureDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@secondseat/db', () => ({
  User: {
    findOne: vi.fn(),
  },
}));

vi.mock('argon2', () => ({
  default: {
    verify: vi.fn(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { POST } from './route';
import { getSession } from '@/lib/session';
import { User } from '@secondseat/db';
import argon2 from 'argon2';

const mockGetSession = vi.mocked(getSession);
const mockFindOne = vi.mocked(User.findOne);
const mockVerify = vi.mocked(argon2.verify);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeUserDoc(overrides: Partial<{ role: string }> = {}) {
  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    email: 'player@example.com',
    name: 'Player One',
    passwordHash: '$argon2id$hashed',
    role: 'user' as const,
    ...overrides,
  };
}

function makeSession() {
  return { user: undefined as unknown, save: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(makeSession() as never);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 200 { ok, role } on valid credentials', async () => {
    const doc = makeUserDoc();
    mockFindOne.mockResolvedValue(doc as never);
    mockVerify.mockResolvedValue(true);

    const res = await POST(makeRequest({ email: 'player@example.com', password: 'secret123' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, role: 'user' });
  });

  it('writes slim session { userId, role } on success', async () => {
    const session = makeSession();
    mockGetSession.mockResolvedValue(session as never);
    mockFindOne.mockResolvedValue(makeUserDoc() as never);
    mockVerify.mockResolvedValue(true);

    await POST(makeRequest({ email: 'player@example.com', password: 'secret123' }));

    expect(session.save).toHaveBeenCalledOnce();
    expect(session.user).toEqual({ userId: '507f1f77bcf86cd799439011', role: 'user' });
  });

  it('returns 401 { error: "invalid_credentials" } when user is not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: 'nobody@example.com', password: 'secret123' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'invalid_credentials' });
  });

  it('returns 401 { error: "invalid_credentials" } when password does not match', async () => {
    mockFindOne.mockResolvedValue(makeUserDoc() as never);
    mockVerify.mockResolvedValue(false);

    const res = await POST(makeRequest({ email: 'player@example.com', password: 'wrong' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'invalid_credentials' });
  });

  it('returns 422 { error: "validation_error" } when email is malformed', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email', password: 'secret123' }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe('validation_error');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 422 when body is missing required fields', async () => {
    const res = await POST(makeRequest({ email: 'player@example.com' }));

    expect(res.status).toBe(422);
  });

  it('returns 422 when body is not valid JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json{',
      }),
    );

    expect(res.status).toBe(422);
  });
});
