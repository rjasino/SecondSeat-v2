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
    create: vi.fn(),
  },
}));

vi.mock('argon2', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { POST } from './route';
import { getSession } from '@/lib/session';
import { User } from '@secondseat/db';

const mockGetSession = vi.mocked(getSession);
const mockFindOne = vi.mocked(User.findOne);
const mockCreate = vi.mocked(User.create);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Player One',
  email: 'player@example.com',
  password: 'secret123',
  confirmPassword: 'secret123',
};

function makeCreatedDoc() {
  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    email: 'player@example.com',
    name: 'Player One',
    role: 'user' as const,
  };
}

function makeSession() {
  return { user: undefined as unknown, save: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindOne.mockResolvedValue(null);
  mockCreate.mockResolvedValue(makeCreatedDoc() as never);
  mockGetSession.mockResolvedValue(makeSession() as never);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('returns 201 and SessionUser on valid registration', async () => {
    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      id: '507f1f77bcf86cd799439011',
      email: 'player@example.com',
      displayName: 'Player One',
      role: 'user',
    });
  });

  it('creates user with role "user" and synced profile.displayName', async () => {
    await POST(makeRequest(validBody));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        name: 'Player One',
        profile: expect.objectContaining({ displayName: 'Player One' }),
      }),
    );
  });

  it('writes the session on success', async () => {
    const session = makeSession();
    mockGetSession.mockResolvedValue(session as never);

    await POST(makeRequest(validBody));

    expect(session.save).toHaveBeenCalledOnce();
    expect(session.user).toMatchObject({ role: 'user' });
  });

  it('returns 409 when email is already registered', async () => {
    mockFindOne.mockResolvedValue(makeCreatedDoc() as never);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(409);
  });

  it('returns 422 when passwords do not match', async () => {
    const res = await POST(
      makeRequest({ ...validBody, confirmPassword: 'different' }),
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'confirmPassword' }),
      ]),
    );
  });

  it('returns 422 when password is too short', async () => {
    const res = await POST(makeRequest({ ...validBody, password: 'short', confirmPassword: 'short' }));

    expect(res.status).toBe(422);
  });

  it('returns 422 when email is malformed', async () => {
    const res = await POST(makeRequest({ ...validBody, email: 'bad-email' }));

    expect(res.status).toBe(422);
  });

  it('returns 422 when name is empty', async () => {
    const res = await POST(makeRequest({ ...validBody, name: '' }));

    expect(res.status).toBe(422);
  });

  it('returns 422 when body is not valid JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json{',
      }),
    );

    expect(res.status).toBe(422);
  });
});
