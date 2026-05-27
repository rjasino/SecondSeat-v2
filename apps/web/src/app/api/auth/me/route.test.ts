import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/user.model", () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

import { GET } from "./route";
import { UserModel } from "@/models/user.model";
import { getSession } from "@/lib/session";

function mockFindById(userData: Record<string, unknown> | null) {
  vi.mocked(UserModel.findById).mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(userData),
    }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindById({
    name: "Test Player",
    email: "player@example.com",
    role: "user",
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 when there is no active session", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: undefined } as never);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthenticated");
  });

  it("returns 200 with user data for a valid user session", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-123",
      role: "user",
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      userId: string;
      name: string;
      email: string;
      role: string;
    };
    expect(body.userId).toBe("user-123");
    expect(body.name).toBe("Test Player");
    expect(body.email).toBe("player@example.com");
    expect(body.role).toBe("user");
  });

  it("returns 200 with role=author for an author session", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "author-456",
      role: "author",
    } as never);
    mockFindById({ name: "Guide Writer", email: "author@example.com", role: "author" });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("author");
  });

  it("returns 200 with role=admin for an admin session", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "admin-789",
      role: "admin",
    } as never);
    mockFindById({ name: "Admin", email: "admin@example.com", role: "admin" });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("admin");
  });

  it("returns 401 when session userId exists but user is not found in the database", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "ghost-user",
      role: "user",
    } as never);
    mockFindById(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthenticated");
  });
});
