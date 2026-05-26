'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import type { SpoilerLevel } from '@secondseat/db';

const TipTapEditor = dynamic(() => import('./tiptap-editor'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldError {
  field: string;
  message: string;
}

interface RetryFormProps {
  sourceId: string;
  initialTitle: string;
  initialGame: string;
  initialArea: string;
  initialSpoilerLevel: SpoilerLevel;
  initialContent: string;
}

const SPOILER_OPTIONS: { value: SpoilerLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function RetryForm({
  sourceId,
  initialTitle,
  initialGame,
  initialArea,
  initialSpoilerLevel,
  initialContent,
}: RetryFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [game, setGame] = useState(initialGame);
  const [area, setArea] = useState(initialArea);
  const [spoilerLevel, setSpoilerLevel] = useState<SpoilerLevel>(initialSpoilerLevel);
  const [editorHtml, setEditorHtml] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);

  const handleEditorChange = useCallback((html: string) => {
    setEditorHtml(html);
  }, []);

  const getFieldError = (field: string) => errors.find((e) => e.field === field)?.message;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/ingest/${sourceId}/retry`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: editorHtml,
          metadata: { game, area, spoilerLevel },
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { errors?: FieldError[]; error?: string };
        setErrors(data.errors ?? [{ field: 'body', message: data.error ?? 'Submission failed' }]);
        return;
      }

      const { jobId } = (await response.json()) as { jobId: string };
      router.push(`/ingest/status/${jobId}`);
    } catch {
      setErrors([{ field: 'body', message: 'Network error — please try again' }]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Global error */}
      {getFieldError('body') && (
        <p className="rounded bg-red-900/40 px-4 py-2 text-sm text-red-400">
          {getFieldError('body')}
        </p>
      )}

      {/* Title */}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-300">
          Title <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
        />
        {getFieldError('title') && (
          <p className="mt-1 text-xs text-red-400">{getFieldError('title')}</p>
        )}
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Game <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={game}
            onChange={(e) => setGame(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
          />
          {getFieldError('metadata.game') && (
            <p className="mt-1 text-xs text-red-400">{getFieldError('metadata.game')}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Area <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
          />
          {getFieldError('metadata.area') && (
            <p className="mt-1 text-xs text-red-400">{getFieldError('metadata.area')}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Spoiler Level</label>
          <select
            value={spoilerLevel}
            onChange={(e) => setSpoilerLevel(e.target.value as SpoilerLevel)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-violet-500 focus:outline-none"
          >
            {SPOILER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content — TipTap editor, initialContent pre-populated with stored Markdown */}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-300">
          Content <span className="text-red-400">*</span>
        </label>
        <p className="mb-2 text-xs text-neutral-500">
          Loaded from stored source. Edit to correct any errors before retrying.
        </p>
        <TipTapEditor
          initialContent={initialContent}
          onChange={handleEditorChange}
          placeholder="Edit guide content here…"
        />
        {getFieldError('content') && (
          <p className="mt-1 text-xs text-red-400">{getFieldError('content')}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-violet-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Retry Ingestion'}
      </button>
    </form>
  );
}
