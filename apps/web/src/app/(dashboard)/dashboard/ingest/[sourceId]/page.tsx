"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ConfirmDialog from "@/components/ConfirmDialog";

interface JobStatus {
  status: string;
  progress: number;
  totalChunks: number;
  processedChunks: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface JobRow {
  _id: string;
  status: string;
  progress: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

interface SourceDetail {
  _id: string;
  title: string;
  sourceType: string;
  status: string;
  createdAt: string;
}

interface DetailResponse {
  source: SourceDetail;
  jobs: JobRow[];
}

const POLLING_INTERVAL_MS = 2000;
const SLOW_POLLING_MS = 10000;
const SLOW_AFTER_MS = 5 * 60 * 1000;

export default function SourceDetailPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}`);
      if (res.status === 404) {
        router.push("/dashboard/ingest");
        return;
      }
      if (!res.ok) {
        setError("Source not found.");
        return;
      }
      const data = (await res.json()) as DetailResponse;
      setDetail(data);
    } catch {
      setError("Failed to load source details.");
    }
  }, [sourceId, router]);

  const pollActiveJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/ingest/status/${jobId}`);
        if (!res.ok) return;
        const status = (await res.json()) as JobStatus;
        setActiveJob(status);

        if (status.status === "queued" || status.status === "processing") {
          const elapsed = Date.now() - startTimeRef.current;
          const delay = elapsed > SLOW_AFTER_MS ? SLOW_POLLING_MS : POLLING_INTERVAL_MS;
          pollingRef.current = setTimeout(() => void pollActiveJob(jobId), delay);
        } else {
          await loadDetail();
        }
      } catch {
        pollingRef.current = setTimeout(() => void pollActiveJob(jobId), POLLING_INTERVAL_MS);
      }
    },
    [loadDetail]
  );

  // Poll while source is in "deleting" status
  const pollDeletingStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}`);
      if (res.status === 404) {
        router.push("/dashboard/ingest");
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as DetailResponse;
      setDetail(data);

      if (data.source.status === "deleting") {
        pollingRef.current = setTimeout(() => void pollDeletingStatus(), POLLING_INTERVAL_MS);
      } else if (data.source.status !== "deleting") {
        // Status was reset (worker failed) — surface the error
        setError("Delete failed — please try again.");
      }
    } catch {
      pollingRef.current = setTimeout(() => void pollDeletingStatus(), POLLING_INTERVAL_MS);
    }
  }, [sourceId, router]);

  useEffect(() => {
    void loadDetail();
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [loadDetail]);

  // Start the right poller based on source status
  useEffect(() => {
    if (!detail) return;
    const { source, jobs } = detail;

    if (source.status === "deleting") {
      startTimeRef.current = Date.now();
      pollingRef.current = setTimeout(() => void pollDeletingStatus(), POLLING_INTERVAL_MS);
      return;
    }

    if (!jobs.length) return;
    const latest = jobs[0]!;
    if (latest.status === "queued" || latest.status === "processing") {
      startTimeRef.current = Date.now();
      void pollActiveJob(latest._id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.source.status, detail?.jobs?.[0]?._id]);

  async function handleDelete() {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}`, {
        method: "DELETE",
      });
      if (res.status === 202) {
        setDeleteOpen(false);
        await loadDetail();
      } else {
        const d = (await res.json()) as { error: string; hint?: string };
        setError(d.hint ?? d.error);
        setDeleteOpen(false);
      }
    } catch {
      setError("Delete failed.");
      setDeleteOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        await loadDetail();
      } else {
        const d = (await res.json()) as { error: string };
        setError(d.error);
      }
    } catch {
      setError("Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  if (error && !detail) {
    return (
      <div>
        <p className="error-msg">{error}</p>
        <Link href="/dashboard/ingest">← Back</Link>
      </div>
    );
  }

  if (!detail) {
    return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  const { source, jobs } = detail;
  const latestJob = jobs[0];
  const displayJob = activeJob ?? (latestJob as unknown as JobStatus | undefined);
  const isDeleting = source.status === "deleting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete "${source.title}"?`}
        message="This will permanently remove all associated vector data, ingestion jobs, and the source record. This cannot be undone."
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link href="/dashboard/ingest" style={{ color: "var(--text-muted)" }}>
          ← Sources
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>{source.title}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
            {source.sourceType} · created {new Date(source.createdAt).toLocaleString()}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {source.status === "failed" && (
            <button className="ghost" onClick={() => void handleRetry()} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
          <button
            className="danger"
            onClick={() => { setError(null); setDeleteOpen(true); }}
            disabled={deleteLoading || source.status === "processing" || isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {isDeleting && (
        <div className="card" style={{ borderColor: "var(--warning, #d97706)" }}>
          <p style={{ color: "#d97706", fontSize: "13px" }}>
            Deleting — vector data and records are being removed. This page will update when complete.
          </p>
        </div>
      )}

      {source.status === "pending_review" && (
        <div className="card" style={{ borderColor: "var(--warning, #ca8a04)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "8px" }}>
            This source is awaiting review before it can be ingested.
          </p>
          <Link href={`/dashboard/ingest/${sourceId}/review`}>
            Review & Approve →
          </Link>
        </div>
      )}

      {displayJob && !isDeleting && (
        <div className="card">
          <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1rem" }}>
            Active job
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className={`badge ${displayJob.status}`}>{displayJob.status}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                {displayJob.processedChunks} / {displayJob.totalChunks} chunks
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${displayJob.progress}%` }}
              />
            </div>
            {displayJob.error && (
              <p className="error-msg" style={{ wordBreak: "break-word" }}>
                {displayJob.error}
              </p>
            )}
            {displayJob.startedAt && (
              <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                Started: {new Date(displayJob.startedAt).toLocaleString()}
                {displayJob.finishedAt &&
                  ` · Finished: ${new Date(displayJob.finishedAt).toLocaleString()}`}
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1rem" }}>
          Job history
        </h2>
        {jobs.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No jobs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Progress</th>
                <th>Error</th>
                <th>Started</th>
                <th>Finished</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j._id}>
                  <td>
                    <span className={`badge ${j.status}`}>{j.status}</span>
                  </td>
                  <td>{j.progress}%</td>
                  <td
                    style={{
                      color: "var(--danger)",
                      fontSize: "12px",
                      maxWidth: "300px",
                      wordBreak: "break-word",
                    }}
                  >
                    {j.error ?? "—"}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                    {j.startedAt ? new Date(j.startedAt).toLocaleString() : "—"}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                    {j.finishedAt ? new Date(j.finishedAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
