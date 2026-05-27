"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import IngestForm from "./IngestForm";
import SourceList from "./SourceList";

export default function IngestPageClient() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "0.25rem" }}>
          Content Ingestion
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Upload guide files (MD or HTML) to build the RAG corpus.
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1rem" }}>
          Upload new source
        </h2>
        <IngestForm
          onUploaded={({ sourceId }) => {
            setRefreshKey((k) => k + 1);
            router.push(`/dashboard/ingest/${sourceId}/review`);
          }}
        />
        <p style={{ marginTop: "1rem", fontSize: "13px", color: "var(--text-muted)" }}>
          Prefer to write content directly?{" "}
          <Link href="/dashboard/ingest/write" style={{ color: "var(--accent, #7c6af7)" }}>
            Write content instead →
          </Link>
        </p>
      </div>

      <div>
        <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1rem" }}>
          Sources
        </h2>
        <SourceList refreshKey={refreshKey} />
      </div>
    </div>
  );
}
