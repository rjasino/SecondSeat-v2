import IntakeForm from '@/components/ingest/intake-form';

export const metadata = { title: 'Ingest Guide — SecondSeat' };

/**
 * /ingest — Guide intake page.
 * Auth guard lives in the layout; this page renders the form directly.
 */
export default function IngestPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-neutral-100">Ingest a Guide</h1>
      <p className="mb-8 text-sm text-neutral-400">
        Upload a Markdown or HTML file, or write content directly in the editor. The guide will be
        chunked and embedded into the RAG index.
      </p>
      <IntakeForm />
    </main>
  );
}
