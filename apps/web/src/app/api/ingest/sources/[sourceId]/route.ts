import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { RagSource } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getDeleteSourceQueue } from '@/lib/queue';
import { loadConfig } from '@/lib/config';

type Params = { params: Promise<{ sourceId: string }> };

// ─── GET /api/ingest/sources/:sourceId ────────────────────────────────────────

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!['author', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { sourceId } = await params;
  if (!mongoose.isValidObjectId(sourceId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await ensureDb();

  const source = await RagSource.findById(sourceId)
    .select('title status sourceType metadata createdBy createdAt')
    .lean();

  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (session.user.role !== 'admin' && source.createdBy.toString() !== session.user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    sourceId: source._id.toString(),
    title: source.title,
    status: source.status,
    sourceType: source.sourceType,
    metadata: source.metadata ?? null,
    createdAt: (source.createdAt as Date).toISOString(),
  });
}

// ─── DELETE /api/ingest/sources/:sourceId ─────────────────────────────────────

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

  // Idempotent — already in the delete pipeline
  if (source.status === 'deleting') {
    return NextResponse.json({ jobId: null }, { status: 202 });
  }

  if (source.status === 'processing') {
    return NextResponse.json(
      { error: 'Source is currently processing — cannot delete' },
      { status: 409 },
    );
  }

  const previousStatus = source.status;
  source.status = 'deleting';
  source.previousStatus = previousStatus;
  await source.save();

  const config = loadConfig();
  const queue = getDeleteSourceQueue(config.REDIS_URL);
  const job = await queue.add('delete-source', { sourceId });

  return NextResponse.json({ jobId: job.id ?? null }, { status: 202 });
}
