'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import type { SpoilerLevel } from '@secondseat/db';

const TipTapEditor = dynamic(() => import('./tiptap-editor'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'deleted';

interface GuideWriterClientProps {
  initialSourceId?: string;
}

const AUTOSAVE_DELAY_MS = 10_000;

const SPOILER_OPTIONS: { value: SpoilerLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function GuideWriterClient({ initialSourceId }: GuideWriterClientProps) {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [game, setGame] = useState('');
  const [area, setArea] = useState('');
  const [spoilerLevel, setSpoilerLevel] = useState<SpoilerLevel>('low');
  const [editorHtml, setEditorHtml] = useState('');

  const [sourceId, setSourceId] = useState<string | null>(initialSourceId ?? null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // ── Autosave logic ─────────────────────────────────────────────────────────

  const save = useCallback(async () => {
    if (!isDirtyRef.current) return;
    isDirtyRef.current = false;

    setSaveState('saving');

    try {
      const payload = {
        title,
        content: editorHtml,
        game,
        area,
        spoilerLevel,
      };

      if (sourceId) {
        const res = await fetch(`/api/ingest/drafts/${sourceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      } else {
        const res = await fetch('/api/ingest/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        const data = (await res.json()) as { sourceId: string };
        setSourceId(data.sourceId);
      }

      setSaveState('saved');
      setLastSavedAt(new Date());
    } catch {
      setSaveState('error');
      isDirtyRef.current = true; // allow retry
    }
  }, [title, editorHtml, game, area, spoilerLevel, sourceId]);

  // Schedule autosave whenever content changes
  function scheduleAutosave() {
    isDirtyRef.current = true;
    setSaveState('idle');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(save, AUTOSAVE_DELAY_MS);
  }

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const handleEditorChange = useCallback(
    (html: string) => {
      setEditorHtml(html);
      scheduleAutosave();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [save],
  );

  function handleFieldChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setter(e.target.value);
      scheduleAutosave();
    };
  }

  // ── Delete draft ───────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!sourceId) return;
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/ingest/drafts/${sourceId}`, { method: 'DELETE' });
      if (res.status === 204) {
        setShowDeleteConfirm(false);
        setSaveState('deleted');
        router.push('/ingest');
      } else {
        const data = (await res.json()) as { error?: string };
        setDeleteError(data.error ?? 'Delete failed — please try again');
        setShowDeleteConfirm(false);
      }
    } catch {
      setDeleteError('Network error — please try again');
      setShowDeleteConfirm(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const headerSaveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'saved'
        ? 'Saved ✓'
        : saveState === 'error'
          ? 'Save failed — retrying…'
          : null;

  const headerSaveClass =
    saveState === 'error'
      ? 'text-red-400'
      : saveState === 'saved'
        ? 'text-green-400'
        : 'text-neutral-400';

  const autosaveLabel = lastSavedAt
    ? `Autosaved at ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <>
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete draft?"
        message="This will permanently delete this draft. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deleteLoading}
      />

      <div className="space-y-6">
        {/* Save state indicator in header area */}
        {headerSaveLabel && (
          <p className={`text-xs ${headerSaveClass}`}>{headerSaveLabel}</p>
        )}

        {/* Title */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={handleFieldChange(setTitle)}
            placeholder="e.g. Water Temple — Ocarina of Time"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
          />
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Game</label>
            <input
              type="text"
              value={game}
              onChange={handleFieldChange(setGame)}
              placeholder="e.g. Zelda: OoT"
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Area</label>
            <input
              type="text"
              value={area}
              onChange={handleFieldChange(setArea)}
              placeholder="e.g. Water Temple"
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Spoiler Level</label>
            <select
              value={spoilerLevel}
              onChange={handleFieldChange(setSpoilerLevel) as React.ChangeEventHandler<HTMLSelectElement>}
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

        {/* Editor */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Content <span className="text-red-400">*</span>
          </label>
          <TipTapEditor onChange={handleEditorChange} placeholder="Write or paste guide content here…" />
          {/* Autosave timestamp below editor */}
          {autosaveLabel && (
            <p className="mt-1 text-xs text-neutral-500">{autosaveLabel}</p>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center gap-4">
          {sourceId && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setShowDeleteConfirm(true);
              }}
              className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-900/30"
            >
              Delete Draft
            </button>
          )}
          {deleteError && (
            <p className="text-sm text-red-400">{deleteError}</p>
          )}
        </div>
      </div>
    </>
  );
}
