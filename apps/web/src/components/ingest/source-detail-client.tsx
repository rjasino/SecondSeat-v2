'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import type { SourceStatus, SourceType } from '@secondseat/db';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceMetadata {
  game?: string;
  area?: string;
  spoilerLevel?: string;
}

interface SourceDetailClientProps {
  sourceId: string;
  initialTitle: string;
  initialStatus: SourceStatus;
  initialSourceType: SourceType;
  initialMetadata: SourceMetadata | null;
  isAdmin: boolean;
}

const POLL_INTERVAL_MS = 3_000;

// ─── Component ────────────────────────────────────────────────────────────────

export default function SourceDetailClient({
  sourceId,
  initialTitle,
  initialStatus,
  initialSourceType,
  initialMetadata,
  isAdmin,
}: SourceDetailClientProps) {
  const router = useRouter();

  const [status, setStatus] = useState<SourceStatus>(initialStatus);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll for status changes when 'deleting'
  useEffect(() => {
    if (status !== 'deleting') return;

    async function poll() {
      try {
        const res = await fetch(`/api/ingest/sources/${sourceId}`);
        if (res.status === 404) {
          // Hard-delete completed — redirect away
          router.push('/ingest');
          return;
        }
        if (res.status === 401) {
          router.push('/');
          return;
        }
        if (!res.ok) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        const data = (await res.json()) as { status: SourceStatus };
        setStatus(data.status);
        if (data.status === 'deleting') {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, sourceId, router]);

  // ── Delete source ─────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}`, { method: 'DELETE' });
      if (res.status === 202) {
        setStatus('deleting');
        setShowDeleteConfirm(false);
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

  const isDeleteDisabled = !isAdmin || status === 'processing' || status === 'deleting';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete source?"
        message="This will permanently delete this source and all its vector data. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deleteLoading}
      />

      <div className="space-y-6">
        {/* Source info */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-100">{initialTitle}</h2>
            <StatusBadge status={status} />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-neutral-500">Type</dt>
            <dd className="text-neutral-300 capitalize">{initialSourceType}</dd>
            {initialMetadata?.game && (
              <>
                <dt className="text-neutral-500">Game</dt>
                <dd className="text-neutral-300">{initialMetadata.game}</dd>
              </>
            )}
            {initialMetadata?.area && (
              <>
                <dt className="text-neutral-500">Area</dt>
                <dd className="text-neutral-300">{initialMetadata.area}</dd>
              </>
            )}
            {initialMetadata?.spoilerLevel && (
              <>
                <dt className="text-neutral-500">Spoiler level</dt>
                <dd className="text-neutral-300 capitalize">{initialMetadata.spoilerLevel}</dd>
              </>
            )}
          </dl>
        </div>

        {/* Deleting notice */}
        {status === 'deleting' && (
          <p className="text-xs text-neutral-500 animate-pulse">
            Cleaning up vector data — this may take a moment…
          </p>
        )}

        {/* Delete error */}
        {deleteError && (
          <p className="rounded bg-red-900/40 px-4 py-2 text-sm text-red-400">{deleteError}</p>
        )}

        {/* Actions */}
        {isAdmin && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setShowDeleteConfirm(true);
              }}
              disabled={isDeleteDisabled}
              className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === 'deleting' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SourceStatus }) {
  if (status === 'deleting') {
    return (
      <span className="badge--deleting rounded-full px-3 py-0.5 text-xs font-semibold">
        Deleting…
      </span>
    );
  }

  const map: Partial<Record<SourceStatus, { label: string; className: string }>> = {
    draft: { label: 'Draft', className: 'bg-neutral-700 text-neutral-300' },
    idle: { label: 'Idle', className: 'bg-neutral-700 text-neutral-300' },
    queued: { label: 'Queued', className: 'bg-neutral-700 text-neutral-300' },
    processing: { label: 'Processing', className: 'bg-blue-900/50 text-blue-300' },
    completed: { label: 'Completed', className: 'bg-green-900/50 text-green-300' },
    failed: { label: 'Failed', className: 'bg-red-900/50 text-red-300' },
  };

  const entry = map[status];
  if (!entry) return null;

  return (
    <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${entry.className}`}>
      {entry.label}
    </span>
  );
}
