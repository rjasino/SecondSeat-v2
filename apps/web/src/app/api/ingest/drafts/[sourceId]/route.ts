import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';

import { RagSource } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { htmlToMarkdown } from '@/lib/turndown';

// ─── Schema ───────────────────────────────────────────────────────────────────

const updateDraftSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  game: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
  spoilerLevel: z.enum(['none', 'low', 'medium', 'high']).optional(),
});

type Params = { params: Promise<{ sourceId: string }> };

// ─── PATCH /api/ingest/drafts/:sourceId ───────────────────────────────────────

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!['author', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient role' }, { status: 403 });
  }

  const { sourceId } = await params;
  if (!mongoose.isValidObjectId(sourceId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 422 });
  }

  const parsed = updateDraftSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? 'body'),
      message: i.message,
    }));
    return NextResponse.json({ errors }, { status: 422 });
  }

  await ensureDb();

  const source = await RagSource.findById(sourceId);
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (session.user.role !== 'admin' && source.createdBy.toString() !== session.user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (source.status !== 'draft') {
    return NextResponse.json({ error: 'Source is not a draft' }, { status: 409 });
  }

  const { title, content, game, area, spoilerLevel } = parsed.data;

  if (title !== undefined) source.title = title;
  if (content !== undefined) {
    source.content = content.startsWith('<') ? htmlToMarkdown(content) : content;
  }
  if (game !== undefined || area !== undefined || spoilerLevel !== undefined) {
    source.metadata = {
      game: game ?? source.metadata?.game ?? '',
      area: area ?? source.metadata?.area ?? '',
      spoilerLevel: spoilerLevel ?? source.metadata?.spoilerLevel ?? 'low',
    };
  }

  await source.save();

  return new NextResponse(null, { status: 204 });
}

// ─── DELETE /api/ingest/drafts/:sourceId ──────────────────────────────────────

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { sourceId } = await params;
  if (!mongoose.isValidObjectId(sourceId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await ensureDb();

  const source = await RagSource.findById(sourceId);
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (source.status !== 'draft') {
    return NextResponse.json(
      { error: 'Source is not a draft — use the source delete endpoint instead' },
      { status: 409 },
    );
  }

  await RagSource.findByIdAndDelete(sourceId);

  return new NextResponse(null, { status: 204 });
}
