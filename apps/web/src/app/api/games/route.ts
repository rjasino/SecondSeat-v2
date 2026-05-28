import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { GameModel } from "@/models/game.model";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export interface GameOption {
  id: string;
  title: string;
  slug: string;
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await connectDB();

  const games = await GameModel.find({ supported: true })
    .select("_id title slug")
    .sort({ title: 1 })
    .lean();

  const result: GameOption[] = games.map((g) => ({
    id: g._id.toString(),
    title: g.title,
    slug: g.slug,
  }));

  return NextResponse.json(result);
}
