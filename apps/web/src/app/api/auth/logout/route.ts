import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(new URL("/", req.url));
}
