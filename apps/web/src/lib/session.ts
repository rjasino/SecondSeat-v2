import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionUser {
  userId: string;
  role: 'user' | 'author' | 'admin';
}

export interface AppSession {
  user?: SessionUser;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export const sessionOptions: SessionOptions = {
  password: process.env['SESSION_SECRET'] ?? '',
  cookieName: 'ss_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
  },
};

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Retrieve the current iron-session from the incoming request cookies.
 * Works in Server Components and Route Handlers (Next.js 15 async cookies()).
 */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<AppSession>(cookieStore, sessionOptions);
}
