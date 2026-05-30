"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import ToolbarButton from "./ToolbarButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  GUIDE_TYPE_VALUES,
  GUIDE_TYPE_LABELS,
  DRAFT_CHAR_LIMIT,
  type GuideType,
} from "@/lib/ingest/schemas";

// tiptap-markdown extends editor.storage with a 'markdown' key but has no
// declared typings — access it via this safe helper.
function getMarkdown(storage: unknown): string {
  const md = (
    storage as Record<string, { getMarkdown?: () => string } | undefined>
  )["markdown"];
  return md?.getMarkdown?.() ?? "";
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  initialSourceId?: string;
  initialTitle?: string;
  initialGame?: string;
  initialGuideType?: string;
  initialAuthor?: string;
  initialContent?: string;
}

type SaveState = "idle" | "saving" | "saved" | "error" | "deleted";

// ─── Styles ──────────────────────────────────────────────────────────────────

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "2px",
  padding: "6px 10px",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-surface)",
};

const dividerStyle: React.CSSProperties = {
  width: "1px",
  alignSelf: "stretch",
  background: "var(--border)",
  margin: "0 4px",
};

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
  background: "var(--bg-elevated)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "14px",
  width: "100%",
  boxSizing: "border-box",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function GuideWriterClient({
  initialSourceId,
  initialTitle = "",
  initialGame = "",
  initialGuideType = "",
  initialAuthor = "",
  initialContent = "",
}: Props) {
  const router = useRouter();

  const [games, setGames] = useState<{ id: string; title: string; slug: string }[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(
    initialSourceId ?? null
  );
  const [title, setTitle] = useState(initialTitle);
  const [game, setGame] = useState(initialGame);

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json() as Promise<{ id: string; title: string; slug: string }[]>)
      .then(setGames)
      .catch(() => { /* keep empty */ });
  }, []);
  const [guideType, setGuideType] = useState(initialGuideType);
  const [author, setAuthor] = useState(initialAuthor);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceIdRef = useRef<string | null>(initialSourceId ?? null);
  const isDirtyRef = useRef(false);
  const latestMarkdownRef = useRef(initialContent);

  // ─── Toast ─────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // ─── Save logic ────────────────────────────────────────────────────────────

  const save = useCallback(
    async (markdown: string) => {
      const currentTitle = title;
      if (!currentTitle.trim() && !markdown.trim()) return;

      setSaveState("saving");
      try {
        if (!sourceIdRef.current) {
          const res = await fetch("/api/ingest/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: currentTitle || "Untitled Draft",
              game: game || undefined,
              guideType: guideType || undefined,
              author: author || undefined,
              content: markdown,
            }),
          });
          if (res.status === 404) { setSaveState("deleted"); return; }
          if (!res.ok) throw new Error("save_failed");
          const data = (await res.json()) as { sourceId: string };
          sourceIdRef.current = data.sourceId;
          setSourceId(data.sourceId);
          // Update the URL bar without triggering a Next.js navigation or
          // re-mounting the Server Component (avoids editor flicker on first save).
          window.history.replaceState(
            null,
            "",
            `/dashboard/ingest/write/${data.sourceId}`
          );
        } else {
          const res = await fetch(
            `/api/ingest/drafts/${sourceIdRef.current}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: currentTitle || undefined,
                game: game || undefined,
                guideType: guideType || undefined,
                author: author || undefined,
                content: markdown,
              }),
            }
          );
          if (res.status === 404) { setSaveState("deleted"); return; }
          if (!res.ok) throw new Error("save_failed");
        }
        setSaveState("saved");
        setLastSavedAt(new Date());
        isDirtyRef.current = false;
      } catch {
        setSaveState("error");
      }
    },
    [title, game, guideType, author]
  );

  const scheduleSave = useCallback(
    (markdown: string) => {
      isDirtyRef.current = true;
      latestMarkdownRef.current = markdown;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void save(markdown), 10_000);
    },
    [save]
  );

  const handleMetaChange = useCallback(() => {
    isDirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => void save(latestMarkdownRef.current),
      10_000
    );
  }, [save]);

  // ─── Delete Draft ──────────────────────────────────────────────────────────

  const handleDeleteDraft = useCallback(async () => {
    if (!sourceIdRef.current) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/ingest/drafts/${sourceIdRef.current}`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        isDirtyRef.current = false;
        router.push("/dashboard/ingest");
      } else {
        const d = (await res.json()) as { hint?: string; error: string };
        setDeleteError(d.hint ?? d.error);
        setDeleteOpen(false);
      }
    } catch {
      setDeleteError("Delete failed. Please try again.");
      setDeleteOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  }, [router]);

  // ─── Editor ────────────────────────────────────────────────────────────────

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Superscript,
      Subscript,
      CharacterCount.configure({ limit: DRAFT_CHAR_LIMIT }),
      Placeholder.configure({ placeholder: "Start writing your guide here…" }),
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: initialContent || "",
    editorProps: {
      attributes: {
        style: [
          "min-height: 480px",
          "padding: 1rem",
          "font-size: 14px",
          "line-height: 1.7",
          "color: var(--text)",
          "outline: none",
          "caret-color: var(--text)",
        ].join("; "),
      },

      handlePaste(_view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const hasImage = items.some((i) => i.type.startsWith("image/"));
        if (hasImage) {
          showToast("Only text content is allowed.");
          event.preventDefault();
          const text = event.clipboardData?.getData("text/plain") ?? "";
          if (text) document.execCommand("insertText", false, text);
          return true;
        }
        return false;
      },

      handleDrop(_view, event) {
        event.preventDefault();
        showToast("Only text content is allowed.");
        return true;
      },
    },

    onUpdate({ editor: ed }) {
      scheduleSave(getMarkdown(ed.storage));
    },
  });

  // ─── Unload guard ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ─── Derived state ─────────────────────────────────────────────────────────

  const charCount =
    (editor?.storage.characterCount as
      | { characters: () => number }
      | undefined)?.characters() ?? 0;
  const atLimit = charCount >= DRAFT_CHAR_LIMIT;

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!title.trim()) { setSubmitError("Title is required."); return; }
    if (!author.trim()) { setSubmitError("Author is required."); return; }
    const markdown = editor ? getMarkdown(editor.storage) : "";
    if (!markdown.trim()) { setSubmitError("Content cannot be empty."); return; }

    setSubmitting(true);
    setSubmitError(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await save(markdown);

    if (!sourceIdRef.current) {
      setSubmitError("Draft failed to save. Please try again.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/ingest/drafts/${sourceIdRef.current}/submit`,
        { method: "POST" }
      );
      if (res.ok) {
        isDirtyRef.current = false;
        router.push(`/dashboard/ingest/${sourceIdRef.current}`);
      } else {
        const d = (await res.json()) as { hint?: string; error: string };
        setSubmitError(d.hint ?? d.error);
      }
    } catch {
      setSubmitError("Submit failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Deleted state ─────────────────────────────────────────────────────────

  if (saveState === "deleted") {
    return (
      <div className="card" style={{ borderColor: "var(--danger, #e53)" }}>
        <p style={{ color: "var(--danger, #e53)", fontWeight: 600 }}>
          This draft was deleted — save your content elsewhere before leaving.
        </p>
        <pre
          style={{ marginTop: "1rem", whiteSpace: "pre-wrap", fontSize: "13px" }}
        >
          {latestMarkdownRef.current}
        </pre>
      </div>
    );
  }

  const saveLabel =
    saveState === "saving" ? "Saving…"
    : saveState === "saved" ? "Saved ✓"
    : saveState === "error" ? "Save failed — retrying…"
    : null;

  const autosaveTime = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Toast */}
      {toastMsg && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "10px 16px",
            fontSize: "13px",
            zIndex: 9999,
            color: "var(--text)",
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete draft?"
        message="This will permanently delete this draft. This cannot be undone."
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={() => void handleDeleteDraft()}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{ fontSize: "20px", fontWeight: 700, marginBottom: "0.25rem" }}
          >
            {sourceId ? "Edit Draft" : "Write Guide Content"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            Content is auto-saved every 10 seconds after your last change.
          </p>
        </div>
        {saveLabel && (
          <span
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color:
                saveState === "error"
                  ? "var(--danger, #e53)"
                  : saveState === "saved"
                  ? "var(--success, #22c55e)"
                  : "var(--text-muted)",
            }}
          >
            {saveLabel}
          </span>
        )}
      </div>

      {/* Metadata card */}
      <div
        className="card"
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {/* Game */}
          <div style={{ flex: "1", minWidth: "180px" }}>
            <label style={labelStyle}>Game</label>
            <select
              value={game}
              onChange={(e) => {
                setGame(e.target.value);
                handleMetaChange();
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
          </div>

          {/* Guide Type */}
          <div style={{ flex: "1", minWidth: "180px" }}>
            <label style={labelStyle}>Guide Type</label>
            <select
              value={guideType}
              onChange={(e) => {
                setGuideType(e.target.value);
                handleMetaChange();
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
          </div>
        </div>

        {/* Author */}
        <div>
          <label style={labelStyle}>
            Author{" "}
            <span style={{ color: "var(--danger, #e53)" }}>*</span>
          </label>
          <input
            type="text"
            value={author}
            maxLength={200}
            placeholder="e.g. IGN, Fextralife, your username"
            onChange={(e) => {
              setAuthor(e.target.value);
              handleMetaChange();
            }}
            style={inputStyle}
          />
        </div>

        {/* Title */}
        <div>
          <label style={labelStyle}>
            Title{" "}
            <span style={{ color: "var(--danger, #e53)" }}>*</span>
          </label>
          <input
            type="text"
            value={title}
            maxLength={200}
            placeholder="e.g. Elden Ring — Stormveil Castle Full Walkthrough"
            onChange={(e) => {
              setTitle(e.target.value);
              handleMetaChange();
            }}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Editor card */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>

        {/* Fixed formatting toolbar */}
        {editor && (
          <div style={toolbarStyle}>
            {/* Text style group */}
            <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (Ctrl+B)">
              B
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (Ctrl+I)">
              <em>I</em>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline (Ctrl+U)">
              <span style={{ textDecoration: "underline" }}>U</span>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
              <span style={{ textDecoration: "line-through" }}>S</span>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code">
              {"</>"}
            </ToolbarButton>

            <div style={dividerStyle} />

            {/* Heading group */}
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
              H1
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
              H2
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
              H3
            </ToolbarButton>

            <div style={dividerStyle} />

            {/* Block group */}
            <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
              •
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered list">
              1.
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
              "
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code block">
              {"{ }"}
            </ToolbarButton>

            <div style={dividerStyle} />

            {/* Superscript / Subscript group */}
            <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive("superscript")} title="Superscript">
              x²
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive("subscript")} title="Subscript">
              x₂
            </ToolbarButton>
          </div>
        )}

        <EditorContent editor={editor} />

        {/* Autosave label + char count */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "6px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "12px",
          }}
        >
          <span style={{ color: "var(--success, #22c55e)" }}>
            {autosaveTime ? `Autosaved at ${autosaveTime}` : ""}
          </span>
          <span style={{ color: atLimit ? "var(--danger, #e53)" : "var(--text-muted)" }}>
            {charCount.toLocaleString()} / {DRAFT_CHAR_LIMIT.toLocaleString()}{" "}
            characters
          </span>
        </div>
      </div>

      {/* Validation / delete errors */}
      {(submitError ?? deleteError) && (
        <p className="error-msg" style={{ margin: 0 }}>
          {submitError ?? deleteError}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        {sourceId && (
          <button
            className="danger"
            onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
            disabled={submitting || deleteLoading}
          >
            Delete Draft
          </button>
        )}
        <button
          className="ghost"
          onClick={() => router.push("/dashboard/ingest")}
          disabled={submitting}
        >
          Back to Sources
        </button>
        <button
          className="primary"
          onClick={() => void handleSubmit()}
          disabled={submitting || saveState === "saving"}
        >
          {submitting ? "Submitting…" : "Submit for Ingestion"}
        </button>
      </div>
    </div>
  );
}
