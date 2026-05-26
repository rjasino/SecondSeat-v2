'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobStatus {
  jobId: string;
  sourceId: string;
  sourceTitle: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalChunks: number | null;
  processedChunks: number;
  progress: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface JobStatusPollerProps {
  jobId: string;
  initialStatus: JobStatus;
}

const POLL_INTERVAL_MS = 3_000;

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobStatusPoller({ jobId, initialStatus }: JobStatusPollerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTerminal = status.status === 'completed' || status.status === 'failed';

  useEffect(() => {
    if (isTerminal) return;

    async function poll() {
      try {
        const res = await fetch(`/api/ingest/status/${jobId}`);
        if (res.status === 401) {
          router.push('/');
          return;
        }
        if (!res.ok) {
          setFetchError('Could not fetch job status.');
          return;
        }
        const data = (await res.json()) as JobStatus;
        setStatus(data);
        setFetchError(null);

        if (data.status !== 'completed' && data.status !== 'failed') {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        setFetchError('Network error — retrying…');
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, isTerminal, router]);

  // ── Progress bar value ─────────────────────────────────────────────────────

  const progressPct =
    status.progress !== null
      ? status.progress
      : status.totalChunks
        ? Math.round((status.processedChunks / status.totalChunks) * 100)
        : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Title */}
      {status.sourceTitle && (
        <p className="text-sm text-neutral-400">
          Source: <span className="text-neutral-100">{status.sourceTitle}</span>
        </p>
      )}

      {/* Status badge */}
      <div className="flex items-center gap-3">
        <StatusBadge status={status.status} />
        {!isTerminal && (
          <span className="text-xs text-neutral-500 animate-pulse">Checking every 3 s…</span>
        )}
      </div>

      {/* Progress bar */}
      <div>
        {progressPct !== null ? (
          <div className="overflow-hidden rounded-full bg-neutral-800 h-3">
            <div
              className="h-3 rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-full bg-neutral-800 h-3">
            <div className="h-3 w-1/3 rounded-full bg-violet-600 animate-[slide_1.5s_ease-in-out_infinite]" />
          </div>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          {status.totalChunks !== null
            ? `${status.processedChunks} / ${status.totalChunks} chunks`
            : 'Calculating chunks…'}
        </p>
      </div>

      {/* Success */}
      {status.status === 'completed' && (
        <div className="rounded bg-green-900/40 px-4 py-3 text-sm text-green-400">
          Ingestion complete — content is ready for the inference pipeline.
        </div>
      )}

      {/* Failure */}
      {status.status === 'failed' && (
        <div className="space-y-3">
          <div className="rounded bg-red-900/40 px-4 py-3 text-sm text-red-400">
            <p className="font-medium">Ingestion failed</p>
            {status.error && <p className="mt-1 text-red-300">{status.error}</p>}
          </div>
          <a
            href={`/ingest/${status.sourceId}/edit`}
            className="inline-block rounded bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Edit &amp; Retry
          </a>
        </div>
      )}

      {/* Fetch error (non-fatal) */}
      {fetchError && (
        <p className="text-xs text-amber-400">{fetchError}</p>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobStatus['status'] }) {
  const map: Record<JobStatus['status'], { label: string; className: string }> = {
    queued: { label: 'Queued', className: 'bg-neutral-700 text-neutral-300' },
    processing: { label: 'Processing', className: 'bg-blue-900/50 text-blue-300' },
    completed: { label: 'Completed', className: 'bg-green-900/50 text-green-300' },
    failed: { label: 'Failed', className: 'bg-red-900/50 text-red-300' },
  };
  const { label, className } = map[status];
  return (
    <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}
