import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { RagIngestionJob, RagSource } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';

// ─── GET /api/ingest/status/:jobId ────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { jobId } = await params;

  if (!mongoose.isValidObjectId(jobId)) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  await ensureDb();

  const job = await RagIngestionJob.findById(jobId).lean();
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Ownership check — admins see all; others must be the creator
  if (session.user.role !== 'admin') {
    const source = await RagSource.findById(job.sourceId).select('createdBy title').lean();
    if (!source) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (source.createdBy.toString() !== session.user.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({
      jobId: job._id.toString(),
      sourceId: job.sourceId.toString(),
      sourceTitle: source.title,
      status: job.status,
      totalChunks: job.totalChunks ?? null,
      processedChunks: job.processedChunks,
      progress: job.progress ?? null,
      error: job.error ?? null,
      startedAt: job.startedAt ?? null,
      finishedAt: job.finishedAt ?? null,
    });
  }

  // Admin path — fetch source title separately
  const source = await RagSource.findById(job.sourceId).select('title').lean();

  return NextResponse.json({
    jobId: job._id.toString(),
    sourceId: job.sourceId.toString(),
    sourceTitle: source?.title ?? null,
    status: job.status,
    totalChunks: job.totalChunks ?? null,
    processedChunks: job.processedChunks,
    progress: job.progress ?? null,
    error: job.error ?? null,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
  });
}
