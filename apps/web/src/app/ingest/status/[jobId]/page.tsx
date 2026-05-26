import { notFound, redirect } from 'next/navigation';
import mongoose from 'mongoose';

import { RagIngestionJob, RagSource } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import JobStatusPoller from '@/components/ingest/job-status-poller';

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export const metadata = { title: 'Job Status — SecondSeat' };

export default async function JobStatusPage({ params }: PageProps) {
  const { jobId } = await params;

  const session = await getSession();
  if (!session.user) {
    redirect('/');
  }

  if (!mongoose.isValidObjectId(jobId)) {
    notFound();
  }

  await ensureDb();

  const job = await RagIngestionJob.findById(jobId).lean();
  if (!job) notFound();

  const source = await RagSource.findById(job.sourceId).select('title createdBy').lean();
  if (!source) notFound();

  if (session.user.role !== 'admin' && source.createdBy.toString() !== session.user.id) {
    redirect('/');
  }

  const initialStatus = {
    jobId: job._id.toString(),
    sourceId: job.sourceId.toString(),
    sourceTitle: source.title,
    status: job.status,
    totalChunks: job.totalChunks ?? null,
    processedChunks: job.processedChunks,
    progress: job.progress ?? null,
    error: job.error ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-neutral-100">Ingestion Status</h1>
      <p className="mb-8 text-sm text-neutral-400">
        Job <span className="font-mono text-neutral-300">{jobId}</span>
      </p>
      <JobStatusPoller jobId={jobId} initialStatus={initialStatus} />
    </main>
  );
}
