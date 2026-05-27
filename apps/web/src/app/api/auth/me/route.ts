import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();

  if (!session.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  await connectDB();
  const user = await UserModel.findById(session.userId)
    .select("name email role")
    .lean();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  return NextResponse.json({
    userId: session.userId,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}
