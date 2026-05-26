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

  // /ingest/* — author and admin only; everything else → /login
  if (pathname.startsWith('/ingest')) {
    if (!user || role === 'user') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // /login — already authenticated users are sent to their home
  if (pathname === '/login') {
    if (user) {
      const dest = role === 'user' ? '/' : '/ingest';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  // /register — same redirect-if-authenticated logic
  if (pathname === '/register') {
    if (user) {
      const dest = role === 'user' ? '/' : '/ingest';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  // / — author/admin are sent to /ingest; everyone else renders the page
  if (pathname === '/') {
    if (user && (role === 'author' || role === 'admin')) {
      return NextResponse.redirect(new URL('/ingest', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/ingest/:path*'],
};
