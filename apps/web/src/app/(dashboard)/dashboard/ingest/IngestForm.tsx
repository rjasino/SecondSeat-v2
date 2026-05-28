"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  GUIDE_TYPE_VALUES,
  GUIDE_TYPE_LABELS,
  type GuideType,
} from "@/lib/ingest/schemas";

interface GameOption {
  id: string;
  title: string;
  slug: string;
}

interface UploadResult {
  sourceId: string;
}

interface Props {
  onUploaded: (result: UploadResult) => void;
}

const ALLOWED = ".md,.markdown,.html,.htm";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: "4px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "var(--surface)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "14px",
  width: "100%",
  boxSizing: "border-box",
};

export default function IngestForm({ onUploaded }: Props) {
  const [games, setGames] = useState<GameOption[]>([]);
  const [game, setGame] = useState("");
  const [guideType, setGuideType] = useState("");
  const [author, setAuthor] = useState("");

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json() as Promise<GameOption[]>)
      .then(setGames)
      .catch(() => { /* keep empty — form validation will catch missing game */ });
  }, []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!game) errors["game"] = "Game is required.";
    if (!guideType) errors["guideType"] = "Guide type is required.";
    if (!author.trim()) errors["author"] = "Author is required.";
    if (!fileRef.current?.files?.[0]) errors["file"] = "Please select a file.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    const file = fileRef.current!.files![0]!;
    const form = new FormData();
    form.append("game", game);
    form.append("guideType", guideType);
    form.append("author", author.trim());
    form.append("file", file);

    setUploading(true);
    try {
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = (await res.json()) as Record<string, unknown>;

      if (res.ok) {
        onUploaded({ sourceId: data["sourceId"] as string });
        if (fileRef.current) fileRef.current.value = "";
        setGame("");
        setGuideType("");
        setAuthor("");
        setFieldErrors({});
      } else {
        if (res.status === 409) {
          const existingId = data["existingSourceId"] as string | undefined;
          setError(
            existingId
              ? `A source for this game and author already exists. Source ID: ${existingId}`
              : "A source for this game and author already exists."
          );
        } else {
          setError(formatError(data, res.status));
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {/* Game */}
      <div>
        <label style={labelStyle}>
          Game <span style={{ color: "var(--danger, #e53)" }}>*</span>
        </label>
        <select
          value={game}
          onChange={(e) => {
            setGame(e.target.value);
            setFieldErrors((fe) => ({ ...fe, game: "" }));
          }}
          style={inputStyle}
        >
          <option value="">— Select game —</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        {fieldErrors["game"] && (
          <p className="error-msg" style={{ marginTop: "4px" }}>
            {fieldErrors["game"]}
          </p>
        )}
      </div>

      {/* Guide Type */}
      <div>
        <label style={labelStyle}>
          Guide Type <span style={{ color: "var(--danger, #e53)" }}>*</span>
        </label>
        <select
          value={guideType}
          onChange={(e) => {
            setGuideType(e.target.value);
            setFieldErrors((fe) => ({ ...fe, guideType: "" }));
          }}
          style={inputStyle}
        >
          <option value="">— Select type —</option>
          {GUIDE_TYPE_VALUES.map((v) => (
            <option key={v} value={v}>
              {GUIDE_TYPE_LABELS[v as GuideType]}
            </option>
          ))}
        </select>
        {fieldErrors["guideType"] && (
          <p className="error-msg" style={{ marginTop: "4px" }}>
            {fieldErrors["guideType"]}
          </p>
        )}
      </div>

      {/* Author */}
      <div>
        <label style={labelStyle}>
          Author <span style={{ color: "var(--danger, #e53)" }}>*</span>
        </label>
        <input
          type="text"
          value={author}
          maxLength={200}
          placeholder="e.g. IGN, Fextralife, your username"
          onChange={(e) => {
            setAuthor(e.target.value);
            setFieldErrors((fe) => ({ ...fe, author: "" }));
          }}
          style={inputStyle}
        />
        {fieldErrors["author"] && (
          <p className="error-msg" style={{ marginTop: "4px" }}>
            {fieldErrors["author"]}
          </p>
        )}
      </div>

      {/* File */}
      <div>
        <label
          htmlFor="file"
          style={{ display: "block", marginBottom: "6px", color: "var(--text-muted)", fontSize: "12px" }}
        >
          GUIDE FILE (.md, .markdown, .html, .htm — max 5 MB){" "}
          <span style={{ color: "var(--danger, #e53)" }}>*</span>
        </label>
        <input
          id="file"
          type="file"
          accept={ALLOWED}
          ref={fileRef}
          onChange={() => setFieldErrors((fe) => ({ ...fe, file: "" }))}
        />
        {fieldErrors["file"] && (
          <p className="error-msg" style={{ marginTop: "4px" }}>
            {fieldErrors["file"]}
          </p>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div>
        <button type="submit" className="primary" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload for Review"}
        </button>
      </div>
    </form>
  );
}

function formatError(data: Record<string, unknown>, status: number): string {
  const code = data["error"] as string | undefined;
  switch (code) {
    case "empty_file":
      return "The file is empty.";
    case "file_too_large":
      return `File exceeds the size limit (${((data["maxBytes"] as number) / 1024 / 1024).toFixed(0)} MB).`;
    case "unsupported_file_type":
      return `Unsupported file type. Allowed: ${(data["allowed"] as string[]).join(", ")}`;
    case "unauthorized":
      return "Session expired. Please sign in again.";
    default:
      return `Upload failed (${status}).`;
  }
}
