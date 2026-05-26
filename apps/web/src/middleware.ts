import { unsealData } from 'iron-session';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { AppSession } from '@/lib/session';

const SESSION_COOKIE = 'ss_session';

async function getSessionUser(request: NextRequest): Promise<AppSession['user'] | undefined> {
  const cookieValue = request.cookies.get(SESSION_COOKIE)?.value;
  if (!cookieValue) return undefined;
  try {
    const session = await unsealData<AppSession>(cookieValue, {
      password: process.env['SESSION_SECRET'] ?? '',
    });
    return session.user;
  } catch {
    return undefined;
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const user = await getSessionUser(request);
  const role = user?.role;

  // /api/ingest/* — role:user gets 403 JSON; unauthenticated → redirect /login
  if (pathname.startsWith('/api/ingest')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (role === 'user') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.next();
  }

  // /ingest/* UI routes — role:user → /, unauthenticated → /login
  if (pathname.startsWith('/ingest')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (role === 'user') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // /login and /register — redirect already-authenticated users to their home
  if (pathname === '/login' || pathname === '/register') {
    if (user) {
      const dest = role === 'user' ? '/' : '/ingest';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  // / — always public; no auto-redirect for any role
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/ingest/:path*', '/api/ingest/:path*'],
};
