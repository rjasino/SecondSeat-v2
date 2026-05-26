import { notFound, redirect } from 'next/navigation';
import mongoose from 'mongoose';

import { RagSource } from '@secondseat/db';
import type { SpoilerLevel } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import RetryForm from '@/components/ingest/retry-form';

interface PageProps {
  params: Promise<{ sourceId: string }>;
}

export const metadata = { title: 'Edit & Retry — SecondSeat' };

export default async function EditSourcePage({ params }: PageProps) {
  const { sourceId } = await params;

  const session = await getSession();
  if (!session.user) {
    redirect('/');
  }

  if (!mongoose.isValidObjectId(sourceId)) {
    notFound();
  }

  await ensureDb();

  const source = await RagSource.findById(sourceId).lean();
  if (!source) notFound();

  if (source.status !== 'failed') {
    // Non-failed sources cannot be retried — redirect to intake
    redirect('/ingest');
  }

  if (session.user.role !== 'admin' && source.createdBy.toString() !== session.user.id) {
    redirect('/');
  }

  const spoilerLevel: SpoilerLevel =
    (source.metadata?.spoilerLevel as SpoilerLevel | undefined) ?? 'low';

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-neutral-100">Edit &amp; Retry</h1>
      <p className="mb-8 text-sm text-neutral-400">
        Correct the content or metadata below, then resubmit to start a new ingestion job.
      </p>
      <RetryForm
        sourceId={sourceId}
        initialTitle={source.title}
        initialGame={source.metadata?.game ?? ''}
        initialArea={source.metadata?.area ?? ''}
        initialSpoilerLevel={spoilerLevel}
        initialContent={source.content}
      />
    </main>
  );
}
