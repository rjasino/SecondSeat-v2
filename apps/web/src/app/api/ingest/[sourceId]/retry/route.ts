import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { RagSource, RagIngestionJob } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getIngestionQueue } from '@/lib/queue';
import { htmlToMarkdown } from '@/lib/turndown';
import { loadConfig } from '@/lib/config';
import { retrySchema, formatZodErrors } from '@/schemas/ingest';

// ─── PATCH /api/ingest/:sourceId/retry ───────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { sourceId } = await params;

  if (!mongoose.isValidObjectId(sourceId)) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { errors: [{ field: 'body', message: 'Invalid JSON' }] },
      { status: 422 },
    );
  }

  const parsed = retrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: formatZodErrors(parsed.error) }, { status: 422 });
  }

  await ensureDb();

  const source = await RagSource.findById(sourceId);
  if (!source) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  // Ownership check
  if (session.user.role !== 'admin' && source.createdBy.toString() !== session.user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  if (source.status !== 'failed') {
    return NextResponse.json({ error: 'Source is not in a failed state' }, { status: 409 });
  }

  // Convert TipTap HTML to Markdown (server-side, consistent with Epic I-A pattern)
  const content = htmlToMarkdown(parsed.data.content);
  if (!content.trim()) {
    return NextResponse.json(
      { errors: [{ field: 'content', message: 'Content is empty after conversion' }] },
      { status: 422 },
    );
  }

  const config = loadConfig();

  // Update source
  source.title = parsed.data.title;
  source.content = content;
  source.metadata = parsed.data.metadata;
  source.status = 'queued';
  await source.save();

  // Pre-generate new job _id
  const jobMongoId = new mongoose.Types.ObjectId();

  // Enqueue new BullMQ job
  let bullJob;
  try {
    const queue = getIngestionQueue(config.REDIS_URL);
    bullJob = await queue.add(
      'ingest',
      { sourceId: source._id.toString(), jobMongoId: jobMongoId.toString() },
      {
        attempts: config.INGEST_JOB_MAX_RETRIES,
        backoff: { type: 'exponential', delay: config.INGEST_JOB_BACKOFF_MS },
      },
    );
  } catch {
    // Rollback source to failed so it's not orphaned
    await RagSource.findByIdAndUpdate(sourceId, { status: 'failed' });
    return NextResponse.json({ error: 'Failed to enqueue ingestion job' }, { status: 500 });
  }

  await RagIngestionJob.create({
    _id: jobMongoId,
    sourceId: source._id,
    queueJobUuid: bullJob.id ?? '',
    status: 'queued',
    processedChunks: 0,
  });

  return NextResponse.json({ jobId: jobMongoId.toString() }, { status: 201 });
}
