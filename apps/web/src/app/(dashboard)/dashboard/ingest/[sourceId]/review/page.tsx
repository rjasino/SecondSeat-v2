"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface ReviewSource {
  _id: string;
  title: string;
  sourceType: string;
  status: string;
  content?: string;
  metadata?: {
    originalFilename?: string;
    sizeBytes?: number;
    game?: string;
    guideType?: string;
    author?: string;
  };
  createdAt: string;
}

interface DetailResponse {
  source: ReviewSource;
}

export default function ReviewPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const router = useRouter();

  const [source, setSource] = useState<ReviewSource | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/ingest/sources/${sourceId}`);
        if (!res.ok) {
          setError("Source not found.");
          return;
        }
        const data = (await res.json()) as DetailResponse;
        setSource(data.source);
        setContent(data.source.content ?? "");
      } catch {
        setError("Failed to load source.");
      } finally {
        setLoading(false);
      }
    })();
  }, [sourceId]);

  async function handleApprove() {
    if (!content.trim()) {
      setError("Content cannot be empty.");
      return;
    }
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.status === 202) {
        router.push(`/dashboard/ingest/${sourceId}`);
      } else {
        const d = (await res.json()) as { error: string; hint?: string };
        setError(d.hint ?? d.error);
      }
    } catch {
      setError("Approve failed. Please try again.");
    } finally {
      setApproving(false);
    }
  }

  async function handleDiscard() {
    if (!confirm(`Discard "${source?.title}"? This cannot be undone.`)) return;
    setDiscarding(true);
    setError(null);
    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        router.push("/dashboard/ingest");
      } else {
        const d = (await res.json()) as { error: string; hint?: string };
        setError(d.hint ?? d.error);
      }
    } catch {
      setError("Discard failed. Please try again.");
    } finally {
      setDiscarding(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  if (error && !source) {
    return (
      <div>
        <p className="error-msg">{error}</p>
        <Link href="/dashboard/ingest">← Back</Link>
      </div>
    );
  }

  if (source && source.status !== "pending_review") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Link href="/dashboard/ingest" style={{ color: "var(--text-muted)" }}>
          ← Sources
        </Link>
        <div className="card">
          <p style={{ color: "var(--text-muted)" }}>
            This source is not awaiting review (status: {source.status}).
          </p>
          <Link href={`/dashboard/ingest/${sourceId}`} style={{ marginTop: "8px", display: "inline-block" }}>
            View source details →
          </Link>
        </div>
      </div>
    );
  }

  const lineCount = content.split("\n").length;
  const charCount = content.length;
  const estimatedChunks = content.split(/\n{2,}/).filter(Boolean).length;
  const sizeKb = source?.metadata?.sizeBytes
    ? (source.metadata.sizeBytes / 1024).toFixed(1)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link href="/dashboard/ingest" style={{ color: "var(--text-muted)" }}>
          ← Sources
        </Link>
      </div>

      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 700 }}>{source?.title}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
          {source?.metadata?.originalFilename ?? source?.sourceType}
          {sizeKb ? ` · ${sizeKb} KB` : ""}
          {source?.createdAt
            ? ` · uploaded ${new Date(source.createdAt).toLocaleString()}`
            : ""}
        </p>
        {(source?.metadata?.game || source?.metadata?.author) && (
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "2px" }}>
            {[
              source.metadata.game,
              source.metadata.guideType,
              source.metadata.author ? `by ${source.metadata.author}` : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: "1.5rem",
          fontSize: "13px",
          color: "var(--text-muted)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "10px 16px",
        }}
      >
        <span>{lineCount} lines</span>
        <span>{charCount.toLocaleString()} chars</span>
        <span>~{estimatedChunks} chunks</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label
          htmlFor="content"
          style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}
        >
          EXTRACTED CONTENT — edit before approving
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: "420px",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "13px",
            lineHeight: 1.6,
            padding: "12px",
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            resize: "vertical",
          }}
        />
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          className="danger"
          onClick={() => void handleDiscard()}
          disabled={discarding || approving}
        >
          {discarding ? "Discarding…" : "Discard"}
        </button>
        <button
          className="primary"
          onClick={() => void handleApprove()}
          disabled={approving || discarding}
        >
          {approving ? "Queuing…" : "Approve & Queue"}
        </button>
      </div>
    </div>
  );
}
