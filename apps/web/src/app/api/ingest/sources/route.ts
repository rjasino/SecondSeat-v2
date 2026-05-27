import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const PAGE_SIZE = 25;

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "author") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");

  await connectDB();

  const filter: Record<string, unknown> = {};
  if (cursor) {
    filter["_id"] = { $lt: cursor };
  }

  const sources = await RagSourceModel.find(filter)
    .sort({ _id: -1 })
    .limit(PAGE_SIZE + 1)
    .select("title sourceType status createdAt _id")
    .lean();

  const hasMore = sources.length > PAGE_SIZE;
  const items = hasMore ? sources.slice(0, PAGE_SIZE) : sources;
  const nextCursor =
    hasMore && items.length > 0
      ? (items[items.length - 1]!._id as Types.ObjectId).toString()
      : null;

  return NextResponse.json({ items, nextCursor }, { status: 200 });
}
