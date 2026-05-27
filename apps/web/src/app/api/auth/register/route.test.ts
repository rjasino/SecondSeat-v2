import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/user.model", () => ({
  UserModel: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("argon2", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("argon2-hashed-password"),
  },
}));

import { POST } from "./route";
import { UserModel } from "@/models/user.model";
import { getSession } from "@/lib/session";

const mockUserId = { toString: () => "user-123" };

const mockSession = {
  userId: undefined as string | undefined,
  role: undefined as string | undefined,
  save: vi.fn().mockResolvedValue(undefined),
};

const validBody = {
  name: "Test Player",
  email: "player@example.com",
  password: "supersecret1234",
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(mockSession as never);
  vi.mocked(UserModel.findOne).mockResolvedValue(null);
  vi.mocked(UserModel.create).mockResolvedValue({ _id: mockUserId } as never);
  mockSession.userId = undefined;
  mockSession.role = undefined;
  mockSession.save.mockResolvedValue(undefined);
});

describe("POST /api/auth/register", () => {
  it("returns 201, sets role=user in session, and saves cookie on success", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; role: string };
    expect(body.ok).toBe(true);
    expect(body.role).toBe("user");
    expect(mockSession.userId).toBe("user-123");
    expect(mockSession.role).toBe("user");
    expect(mockSession.save).toHaveBeenCalledOnce();
  });

  it("returns 409 when the email is already registered", async () => {
    vi.mocked(UserModel.findOne).mockResolvedValue({ _id: "existing" } as never);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("email_already_registered");
  });

  it("returns 422 when password is shorter than 12 characters", async () => {
    const res = await POST(makeRequest({ ...validBody, password: "tooshort" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });

  it("returns 422 when email is not a valid address", async () => {
    const res = await POST(makeRequest({ ...validBody, email: "not-an-email" }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when name is an empty string", async () => {
    const res = await POST(makeRequest({ ...validBody, name: "" }));
    expect(res.status).toBe(422);
  });

  it("strips any role field from the payload — created user is always role=user", async () => {
    const res = await POST(makeRequest({ ...validBody, role: "admin" }));
    expect(res.status).toBe(201);
    expect(UserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user" })
    );
  });

  it("lowercases the email before duplicate check and before storing", async () => {
    await POST(makeRequest({ ...validBody, email: "PLAYER@EXAMPLE.COM" }));
    expect(UserModel.findOne).toHaveBeenCalledWith({ email: "player@example.com" });
    expect(UserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "player@example.com" })
    );
  });

  it("does not create a user when duplicate check finds an existing email", async () => {
    vi.mocked(UserModel.findOne).mockResolvedValue({ _id: "existing" } as never);
    await POST(makeRequest(validBody));
    expect(UserModel.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-JSON request body", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
