import { notFound, redirect } from 'next/navigation';
import mongoose from 'mongoose';

import { RagSource } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import SourceDetailClient from '@/components/ingest/source-detail-client';

interface PageProps {
  params: Promise<{ sourceId: string }>;
}

export const metadata = { title: 'Source Detail — SecondSeat' };

export default async function SourceDetailPage({ params }: PageProps) {
  const { sourceId } = await params;

  const session = await getSession();
  if (!session.user) {
    redirect('/');
  }
  if (!['author', 'admin'].includes(session.user.role)) {
    redirect('/');
  }

  if (!mongoose.isValidObjectId(sourceId)) {
    notFound();
  }

  await ensureDb();

  const source = await RagSource.findById(sourceId)
    .select('title status sourceType metadata createdBy createdAt')
    .lean();

  if (!source) notFound();

  if (session.user.role !== 'admin' && source.createdBy.toString() !== session.user.userId) {
    redirect('/');
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-neutral-100">Source Detail</h1>
      <p className="mb-8 text-sm text-neutral-400">
        Manage this ingested guide source.
      </p>
      <SourceDetailClient
        sourceId={sourceId}
        initialTitle={source.title}
        initialStatus={source.status}
        initialSourceType={source.sourceType}
        initialMetadata={source.metadata ?? null}
        isAdmin={session.user.role === 'admin'}
      />
    </main>
  );
}
