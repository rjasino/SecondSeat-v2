import GuideWriterClient from '@/components/ingest/guide-writer-client';

export const metadata = { title: 'Write Guide — SecondSeat' };

export default function WriteGuidePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-neutral-100">Write a Guide</h1>
      <p className="mb-8 text-sm text-neutral-400">
        Write your guide content below. It autosaves as a draft every 10 seconds.
      </p>
      <GuideWriterClient />
    </main>
  );
}
