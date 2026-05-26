'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import type { SpoilerLevel } from '@secondseat/db';

// Lazy-load TipTap to avoid SSR issues
const TipTapEditor = dynamic(() => import('./tiptap-editor'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type SourceMode = 'file' | 'text';

interface FieldError {
  field: string;
  message: string;
}

const SPOILER_OPTIONS: { value: SpoilerLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function IntakeForm() {
  const router = useRouter();

  // Form state
  const [mode, setMode] = useState<SourceMode>('file');
  const [title, setTitle] = useState('');
  const [game, setGame] = useState('');
  const [area, setArea] = useState('');
  const [spoilerLevel, setSpoilerLevel] = useState<SpoilerLevel>('low');
  const [editorHtml, setEditorHtml] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  const getFieldError = (field: string) =>
    errors.find((e) => e.field === field)?.message;

  const handleEditorChange = useCallback((html: string) => {
    setEditorHtml(html);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);

    try {
      let response: Response;

      if (mode === 'file') {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setErrors([{ field: 'file', message: 'Please select a file' }]);
          return;
        }
        const fd = new FormData();
        fd.append('title', title);
        fd.append('sourceType', 'file');
        fd.append('game', game);
        fd.append('area', area);
        fd.append('spoilerLevel', spoilerLevel);
        fd.append('file', file);

        response = await fetch('/api/ingest', { method: 'POST', body: fd });
      } else {
        response = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            sourceType: 'text',
            content: editorHtml,
            game,
            area,
            spoilerLevel,
          }),
        });
      }

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Global error */}
      {getFieldError('body') && (
        <p className="rounded bg-red-900/40 px-4 py-2 text-sm text-red-400">
          {getFieldError('body')}
        </p>
      )}

      {/* Source mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('file')}
          className={`rounded px-4 py-2 text-sm font-medium transition ${
            mode === 'file'
              ? 'bg-violet-600 text-white'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          Upload File
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`rounded px-4 py-2 text-sm font-medium transition ${
            mode === 'text'
              ? 'bg-violet-600 text-white'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          Write in Form
        </button>
      </div>

      {/* Title */}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-300">
          Title <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Water Temple — Ocarina of Time"
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
            placeholder="e.g. Zelda: OoT"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
          />
          {getFieldError('game') && (
            <p className="mt-1 text-xs text-red-400">{getFieldError('game')}</p>
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
            placeholder="e.g. Water Temple"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
          />
          {getFieldError('area') && (
            <p className="mt-1 text-xs text-red-400">{getFieldError('area')}</p>
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

      {/* Content input */}
      {mode === 'file' ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Guide file <span className="text-red-400">*</span>
            <span className="ml-2 font-normal text-neutral-500">(.md or .html, max 5 MB)</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.html,text/markdown,text/html"
            className="w-full cursor-pointer rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 file:mr-3 file:rounded file:border-0 file:bg-violet-700 file:px-3 file:py-1 file:text-xs file:text-white"
          />
          {getFieldError('file') && (
            <p className="mt-1 text-xs text-red-400">{getFieldError('file')}</p>
          )}
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Content <span className="text-red-400">*</span>
          </label>
          <TipTapEditor onChange={handleEditorChange} placeholder="Write or paste guide content here…" />
          {getFieldError('content') && (
            <p className="mt-1 text-xs text-red-400">{getFieldError('content')}</p>
          )}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-violet-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Ingest Guide'}
      </button>
    </form>
  );
}
