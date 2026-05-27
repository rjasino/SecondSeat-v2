import { NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { email, password } = parsed.data;

  await connectDB();
  const user = await UserModel.findOne({ email: email.toLowerCase() });

  // Use the same response for wrong email and wrong password to prevent enumeration
  if (!user) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const valid = await argon2.verify(user.password, password);
  if (!valid) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user._id.toString();
  session.role = user.role;
  await session.save();

  return NextResponse.json({ ok: true, role: user.role }, { status: 200 });
}
