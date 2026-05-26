import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

// next/navigation redirect throws a special NEXT_REDIRECT error in tests
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` });
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { POST } from './route';
import { getSession } from '@/lib/session';

const mockGetSession = vi.mocked(getSession);

function makeSession() {
  return { destroy: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('destroys the session and redirects to /', async () => {
    const session = makeSession();
    mockGetSession.mockResolvedValue(session as never);

    await expect(POST()).rejects.toMatchObject({ digest: expect.stringContaining('/') });
    expect(session.destroy).toHaveBeenCalledOnce();
  });
});
