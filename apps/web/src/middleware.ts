import { unsealData } from "iron-session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Inline type — cannot import session.ts here because it imports next/headers (Node.js only)
interface SessionData {
  userId?: string;
  role?: "user" | "author" | "admin";
}

const COOKIE_NAME = "secondseat-session";

async function readSession(req: NextRequest): Promise<SessionData | null> {
  const password = process.env["SESSION_PASSWORD"];
  if (!password) return null;

  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) return null;

  try {
    const data = await unsealData<SessionData>(cookieValue, { password });
    return data.userId ? data : null;
  } catch {
    // Invalid or tampered cookie
    return null;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Always pass through: Next.js internals, public auth endpoints, health check
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const session = await readSession(req);

  // /login and /register: public for guests, redirect away for authenticated users
  if (pathname === "/login" || pathname === "/register") {
    if (session) {
      const dest =
        session.role === "user" ? "/dashboard/play" : "/dashboard/ingest";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // /dashboard/play: any authenticated user
  if (pathname.startsWith("/dashboard/play")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // Privileged routes: /dashboard/** (UI) and /api/ingest/** (API) — admin/author only
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/ingest")
  ) {
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (session.role === "user") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }

    // author or admin: proceed
    return NextResponse.next();
  }

  // All other routes (e.g. landing page /): no access restriction
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
