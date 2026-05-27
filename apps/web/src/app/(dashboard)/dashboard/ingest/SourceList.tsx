"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SourceRow {
  _id: string;
  title: string;
  sourceType: string;
  status: string;
  createdAt: string;
  metadata?: { game?: string; guideType?: string };
}

interface Props {
  refreshKey: number;
}

export default function SourceList({ refreshKey }: Props) {
  const [items, setItems] = useState<SourceRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSources = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = cursor
        ? `/api/ingest/sources?cursor=${cursor}`
        : "/api/ingest/sources";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load sources");
      const data = (await res.json()) as {
        items: SourceRow[];
        nextCursor: string | null;
      };
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } catch {
      setError("Could not load sources.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources, refreshKey]);

  if (loading && items.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Loading sources…</p>;
  }

  if (error) return <p className="error-msg">{error}</p>;

  if (items.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        No sources yet. Upload a guide file above.
      </p>
    );
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Status</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s._id}>
              <td>
                {s.title}
                {s.metadata?.game && (
                  <span
                    style={{
                      display: "block",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginTop: "2px",
                    }}
                  >
                    {s.metadata.game}
                  </span>
                )}
              </td>
              <td style={{ color: "var(--text-muted)" }}>{s.sourceType}</td>
              <td>
                <span className={`badge ${s.status}`}>{s.status}</span>
              </td>
              <td style={{ color: "var(--text-muted)" }}>
                {new Date(s.createdAt).toLocaleString()}
              </td>
              <td>
                {s.status === "draft" ? (
                  <Link href={`/dashboard/ingest/write/${s._id}`}>Edit →</Link>
                ) : (
                  <Link href={`/dashboard/ingest/${s._id}`}>Details →</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {nextCursor && (
        <div style={{ marginTop: "1rem" }}>
          <button
            className="ghost"
            onClick={() => void loadSources(nextCursor)}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
