import NavBar from "@/components/NavBar";

export default function HomePage() {
  return (
    <>
      <NavBar />
      <main
        style={{
          maxWidth: "680px",
          margin: "0 auto",
          padding: "5.5rem 2rem 7rem",
          textAlign: "center",
        }}
      >
        {/* Status chip */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(61,142,245,0.07)",
            border: "1px solid rgba(61,142,245,0.16)",
            borderRadius: "100px",
            padding: "5px 14px",
            marginBottom: "2.75rem",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--success)",
              display: "inline-block",
              flexShrink: 0,
              animation: "ss-pulse-dot 2.4s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: "10px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Second Screen Active
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "var(--font-chakra), 'Chakra Petch', sans-serif",
            fontSize: "clamp(2.1rem, 5.5vw, 3.5rem)",
            fontWeight: 800,
            lineHeight: 1.07,
            letterSpacing: "-0.02em",
            marginBottom: "1.25rem",
          }}
        >
          Hints that guide.
          <br />
          <span style={{ color: "var(--accent)" }}>Spoilers that don&apos;t.</span>
        </h1>

        {/* Subtext */}
        <p
          style={{
            color: "var(--text-muted)",
            lineHeight: 1.85,
            fontSize: "15px",
            maxWidth: "400px",
            margin: "0 auto 2.75rem",
          }}
        >
          SecondSeat delivers 1–3 line, context-aware nudges the moment you
          need them — without breaking immersion or revealing what&apos;s ahead.
        </p>

        {/* CTA */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/register" className="link-btn-primary">
            Get started
          </a>
          <a href="/login" className="link-btn-ghost">
            Sign in
          </a>
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: "0.6rem",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "4.5rem",
          }}
        >
          {["1–3 line hints only", "Spoiler-safe by default", "Context-aware"].map((f) => (
            <span
              key={f}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "100px",
                padding: "5px 14px",
                fontSize: "11px",
                color: "var(--text-muted)",
                fontFamily: "var(--font-jetbrains), monospace",
                letterSpacing: "0.05em",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </main>
    </>
  );
}
