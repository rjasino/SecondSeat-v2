"use client";

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}

export default function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focus
        onClick();
      }}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "26px",
        height: "26px",
        padding: "0 4px",
        borderRadius: "4px",
        border: active
          ? "1px solid var(--accent, #7c3aed)"
          : "1px solid transparent",
        background: active ? "rgba(124,58,237,0.15)" : "transparent",
        color: active ? "var(--accent, #7c3aed)" : "var(--text-muted)",
        fontSize: "12px",
        fontWeight: 600,
        cursor: "pointer",
        lineHeight: 1,
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {children}
    </button>
  );
}
