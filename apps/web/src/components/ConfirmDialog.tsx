"use client";

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "1.5rem",
          width: "min(420px, 90vw)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2
          id="confirm-dialog-title"
          style={{ fontSize: "16px", fontWeight: 700 }}
        >
          {title}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            ref={cancelRef}
            className="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
