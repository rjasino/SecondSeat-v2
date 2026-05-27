import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("iron-session", () => ({
  unsealData: vi.fn(),
}));

import { middleware } from "./middleware";
import { unsealData } from "iron-session";

const COOKIE_NAME = "secondseat-session";
const TEST_PASSWORD = "test-session-password-32chars!!";

function makeRequest(pathname: string, cookieValue?: string): NextRequest {
  const url = `http://localhost${pathname}`;
  const headers = cookieValue
    ? new Headers({ Cookie: `${COOKIE_NAME}=${cookieValue}` })
    : undefined;
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["SESSION_PASSWORD"] = TEST_PASSWORD;
});

// ─── Public pass-through routes ───────────────────────────────────────────────

describe("public routes — always pass through without session check", () => {
  it("passes /api/auth/login through without reading session", async () => {
    const res = await middleware(makeRequest("/api/auth/login"));
    expect(res.status).toBe(200);
    expect(unsealData).not.toHaveBeenCalled();
  });

  it("passes /api/auth/register through without reading session", async () => {
    const res = await middleware(makeRequest("/api/auth/register"));
    expect(res.status).toBe(200);
    expect(unsealData).not.toHaveBeenCalled();
  });

  it("passes /api/health through without reading session", async () => {
    const res = await middleware(makeRequest("/api/health"));
    expect(res.status).toBe(200);
    expect(unsealData).not.toHaveBeenCalled();
  });
});

// ─── /login and /register ─────────────────────────────────────────────────────

describe("/login — redirect authenticated users away", () => {
  it("allows an unauthenticated visitor to reach /login", async () => {
    const res = await middleware(makeRequest("/login"));
    expect(res.status).toBe(200);
  });

  it("redirects role=user from /login to /", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "u1", role: "user" });
    const res = await middleware(makeRequest("/login", "sealed-cookie"));
    expect(res.headers.get("location")).toContain("/");
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
  });

  it("redirects role=author from /login to /dashboard/ingest", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "a1", role: "author" });
    const res = await middleware(makeRequest("/login", "sealed-cookie"));
    expect(res.headers.get("location")).toContain("/dashboard/ingest");
  });

  it("redirects role=admin from /login to /dashboard/ingest", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "a1", role: "admin" });
    const res = await middleware(makeRequest("/login", "sealed-cookie"));
    expect(res.headers.get("location")).toContain("/dashboard/ingest");
  });
});

describe("/register — redirect authenticated users away", () => {
  it("allows an unauthenticated visitor to reach /register", async () => {
    const res = await middleware(makeRequest("/register"));
    expect(res.status).toBe(200);
  });

  it("redirects an authenticated user away from /register", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "u1", role: "user" });
    const res = await middleware(makeRequest("/register", "sealed-cookie"));
    expect(res.headers.get("location")).not.toBeNull();
  });
});

// ─── /dashboard/** (UI routes) ───────────────────────────────────────────────

describe("/dashboard — UI route protection", () => {
  it("redirects unauthenticated request to /login", async () => {
    const res = await middleware(makeRequest("/dashboard/ingest"));
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects role=user to / (insufficient role)", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "u1", role: "user" });
    const res = await middleware(makeRequest("/dashboard/ingest", "sealed-cookie"));
    expect(res.headers.get("location")).toMatch(/\/$/);
  });

  it("passes role=author through to /dashboard/ingest", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "a1", role: "author" });
    const res = await middleware(makeRequest("/dashboard/ingest", "sealed-cookie"));
    expect(res.status).toBe(200);
  });

  it("passes role=admin through to /dashboard/ingest", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "a1", role: "admin" });
    const res = await middleware(makeRequest("/dashboard/ingest", "sealed-cookie"));
    expect(res.status).toBe(200);
  });
});

// ─── /api/ingest/** (API routes) ─────────────────────────────────────────────

describe("/api/ingest — API route protection", () => {
  it("returns 401 JSON for unauthenticated request", async () => {
    const res = await middleware(makeRequest("/api/ingest/drafts"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthenticated");
  });

  it("returns 403 JSON for role=user", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "u1", role: "user" });
    const res = await middleware(makeRequest("/api/ingest/drafts", "sealed-cookie"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("forbidden");
  });

  it("passes role=author through to /api/ingest routes", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "a1", role: "author" });
    const res = await middleware(makeRequest("/api/ingest/drafts", "sealed-cookie"));
    expect(res.status).toBe(200);
  });

  it("passes role=admin through to /api/ingest routes", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "a1", role: "admin" });
    const res = await middleware(makeRequest("/api/ingest/sources", "sealed-cookie"));
    expect(res.status).toBe(200);
  });
});

// ─── Public landing page ─────────────────────────────────────────────────────

describe("/ — public landing page", () => {
  it("passes through for unauthenticated visitors", async () => {
    const res = await middleware(makeRequest("/"));
    expect(res.status).toBe(200);
  });

  it("passes through for authenticated users of any role", async () => {
    vi.mocked(unsealData).mockResolvedValue({ userId: "u1", role: "user" });
    const res = await middleware(makeRequest("/", "sealed-cookie"));
    expect(res.status).toBe(200);
  });
});

// ─── Invalid / tampered cookie ───────────────────────────────────────────────

describe("tampered or invalid session cookie", () => {
  it("treats a cookie that fails to unseal as unauthenticated", async () => {
    vi.mocked(unsealData).mockRejectedValue(new Error("seal broken"));
    const res = await middleware(makeRequest("/dashboard/ingest", "bad-cookie"));
    // Should redirect to /login, not throw
    expect(res.headers.get("location")).toContain("/login");
  });
});
