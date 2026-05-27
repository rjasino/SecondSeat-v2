import { NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { name, email, password } = parsed.data;

  await connectDB();

  const existing = await UserModel.findOne({ email: email.toLowerCase() });
  if (existing) {
    return NextResponse.json(
      { error: "email_already_registered" },
      { status: 409 }
    );
  }

  const hash = await argon2.hash(password);
  const user = await UserModel.create({
    name: name.trim(),
    email: email.toLowerCase(),
    password: hash,
    role: "user",
  });

  const session = await getSession();
  session.userId = user._id.toString();
  session.role = "user";
  await session.save();

  return NextResponse.json({ ok: true, role: "user" }, { status: 201 });
}
