"use client";

import { useState, useRef, useCallback } from "react";

// --- Types ---
type PlayerGoal = "progression" | "exploration" | "confirmation" | "completion";
type ConfidenceLevel = "confident" | "uncertain" | "stuck";

interface SessionState {
  playSessionId: string;
  runContextId: string;
  gameId: string;
  gameArea: string;
  chapter: string;
  playerGoal: PlayerGoal;
  confidenceLevel: ConfidenceLevel;
}

interface HintEntry {
  id: string;
  question: string;
  response: string;
  lineCount: number;
  refused: boolean;
  refusalReason: string | null;
}

interface SessionForm {
  gameId: string;
  gameArea: string;
  chapter: string;
  subArea: string;
  playerGoal: PlayerGoal;
  confidenceLevel: ConfidenceLevel;
}

interface HintForm {
  text: string;
  gameArea: string;
  chapter: string;
  subArea: string;
}

// --- Helpers ---
const OID_REGEX = /^[a-f\d]{24}$/i;

function generateObjectId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Shared label style matching the rest of the dashboard
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: "4px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

export default function PlayClient() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [sessionForm, setSessionForm] = useState<SessionForm>({
    gameId: "",
    gameArea: "",
    chapter: "",
    subArea: "",
    playerGoal: "progression",
    confidenceLevel: "uncertain",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [hintForm, setHintForm] = useState<HintForm>({
    text: "",
    gameArea: "",
    chapter: "",
    subArea: "",
  });

  const [streaming, setStreaming] = useState(false);
  const [currentTokens, setCurrentTokens] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [history, setHistory] = useState<HintEntry[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  // --- Session start ---
  const handleStartSession = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!OID_REGEX.test(sessionForm.gameId))
      errors["gameId"] = "Must be a valid 24-character hex ObjectId.";
    if (!sessionForm.gameArea.trim())
      errors["gameArea"] = "Game Area is required.";
    if (!sessionForm.chapter.trim())
      errors["chapter"] = "Chapter is required.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSession({
      playSessionId: generateObjectId(),
      runContextId: generateObjectId(),
      gameId: sessionForm.gameId.trim(),
      gameArea: sessionForm.gameArea.trim(),
      chapter: sessionForm.chapter.trim(),
      playerGoal: sessionForm.playerGoal,
      confidenceLevel: sessionForm.confidenceLevel,
    });
    setHintForm({
      text: "",
      gameArea: sessionForm.gameArea.trim(),
      chapter: sessionForm.chapter.trim(),
      subArea: sessionForm.subArea.trim(),
    });
    setHistory([]);
    setCurrentTokens("");
    setStreamError(null);
    setShowForm(false);
  }, [sessionForm]);

  const handleNewSession = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setCurrentTokens("");
    setStreamError(null);
    setSession(null);
    setHistory([]);
    setSessionForm({
      gameId: "",
      gameArea: "",
      chapter: "",
      subArea: "",
      playerGoal: "progression",
      confidenceLevel: "uncertain",
    });
    setFormErrors({});
    setShowForm(true);
  }, []);

  // --- Hint submit ---
  const handleSubmitHint = useCallback(async () => {
    if (!session || streaming || !hintForm.text.trim()) return;

    const question = hintForm.text.trim();
    const gameArea = hintForm.gameArea.trim() || session.gameArea;
    const chapter = hintForm.chapter.trim() || session.chapter;

    const body: Record<string, unknown> = {
      playSessionId: session.playSessionId,
      runContextId: session.runContextId,
      gameId: session.gameId,
      gameArea,
      chapter,
      playerGoal: session.playerGoal,
      confidenceLevel: session.confidenceLevel,
      text: question,
    };
    if (hintForm.subArea.trim()) body.subArea = hintForm.subArea.trim();

    setStreaming(true);
    setCurrentTokens("");
    setStreamError(null);
    setHintForm((p) => ({ ...p, text: "" }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({ error: "Request failed" }))) as Record<string, unknown>;
        setStreamError(String(err.error ?? "Request failed"));
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastEvent = "";
      let accumulated = "";

      loop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            lastEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const raw = line.slice(5).trim();
            try {
              const payload = JSON.parse(raw) as Record<string, unknown>;

              if (lastEvent === "done") {
                const refused = payload.refused === true;
                const refusalReason =
                  typeof payload.refusalReason === "string" ? payload.refusalReason : null;
                const lineCount =
                  typeof payload.lineCount === "number" ? payload.lineCount : 1;
                setHistory((prev) => [
                  ...prev,
                  { id: generateObjectId(), question, response: accumulated, lineCount, refused, refusalReason },
                ]);
                setCurrentTokens("");
                setStreaming(false);
                lastEvent = "";
                break loop;
              } else if (lastEvent === "error") {
                setStreamError(
                  typeof payload.message === "string" ? payload.message : "Hint generation failed."
                );
                setStreaming(false);
                lastEvent = "";
                break loop;
              } else if (typeof payload.token === "string") {
                accumulated += payload.token;
                setCurrentTokens((prev) => prev + payload.token);
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setStreamError("Connection error — is the inference service running?");
      }
      setStreaming(false);
    }
  }, [session, streaming, hintForm]);

  // ---- No Session ----
  if (!session && !showForm) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "0.25rem" }}>
            Play
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Test the inference pipeline — send hint requests and stream responses in real time.
          </p>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            No active session. Start one to begin querying the inference service.
          </p>
          <div>
            <button className="primary" onClick={() => setShowForm(true)}>
              New Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Session Form ----
  if (showForm && !session) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "0.25rem" }}>
            Play
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Configure your session context before querying.
          </p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1.25rem" }}>
            Session setup
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            <div style={rowStyle}>
              <label style={labelStyle}>
                Game ID <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="24-character hex ObjectId"
                value={sessionForm.gameId}
                spellCheck={false}
                onChange={(e) => {
                  setSessionForm((p) => ({ ...p, gameId: e.target.value }));
                  setFormErrors((fe) => ({ ...fe, gameId: "" }));
                }}
              />
              {formErrors["gameId"] && <p className="error-msg">{formErrors["gameId"]}</p>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div style={rowStyle}>
                <label style={labelStyle}>
                  Game Area <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Eldin Province"
                  value={sessionForm.gameArea}
                  onChange={(e) => {
                    setSessionForm((p) => ({ ...p, gameArea: e.target.value }));
                    setFormErrors((fe) => ({ ...fe, gameArea: "" }));
                  }}
                />
                {formErrors["gameArea"] && <p className="error-msg">{formErrors["gameArea"]}</p>}
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>
                  Chapter <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chapter 3"
                  value={sessionForm.chapter}
                  onChange={(e) => {
                    setSessionForm((p) => ({ ...p, chapter: e.target.value }));
                    setFormErrors((fe) => ({ ...fe, chapter: "" }));
                  }}
                />
                {formErrors["chapter"] && <p className="error-msg">{formErrors["chapter"]}</p>}
              </div>
            </div>

            <div style={rowStyle}>
              <label style={labelStyle}>Sub-area</label>
              <input
                type="text"
                placeholder="optional"
                value={sessionForm.subArea}
                onChange={(e) => setSessionForm((p) => ({ ...p, subArea: e.target.value }))}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div style={rowStyle}>
                <label style={labelStyle}>
                  Player Goal <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select
                  value={sessionForm.playerGoal}
                  onChange={(e) => setSessionForm((p) => ({ ...p, playerGoal: e.target.value as PlayerGoal }))}
                >
                  <option value="progression">Progression</option>
                  <option value="exploration">Exploration</option>
                  <option value="confirmation">Confirmation</option>
                  <option value="completion">Completion</option>
                </select>
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>
                  Confidence <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select
                  value={sessionForm.confidenceLevel}
                  onChange={(e) => setSessionForm((p) => ({ ...p, confidenceLevel: e.target.value as ConfidenceLevel }))}
                >
                  <option value="confident">Confident</option>
                  <option value="uncertain">Uncertain</option>
                  <option value="stuck">Stuck</option>
                </select>
              </div>
            </div>

            <div>
              <button className="primary" onClick={handleStartSession}>
                Start Session
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Active Session ----
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "0.25rem" }}>Play</h1>
          <p style={{ color: "var(--text-muted)" }}>Active session — inference pipeline live.</p>
        </div>
        <button className="ghost" onClick={handleNewSession} style={{ flexShrink: 0 }}>
          New Session
        </button>
      </div>

      {/* Session context summary */}
      <div className="card" style={{ padding: "1rem 1.5rem" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          Session Context
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", fontSize: "13px" }}>
          <SessionField label="Game ID" value={`${session!.gameId.slice(0, 8)}…`} />
          <SessionField label="Area" value={session!.gameArea} />
          <SessionField label="Chapter" value={session!.chapter} />
          <SessionField label="Goal" value={session!.playerGoal} />
          <SessionField label="Confidence" value={session!.confidenceLevel} />
        </div>
      </div>

      {/* Hint input */}
      <div className="card">
        <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1rem" }}>Ask a hint</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={rowStyle}>
            <label style={labelStyle}>
              Question <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Ask SecondSeat…"
              value={hintForm.text}
              disabled={streaming}
              onChange={(e) => setHintForm((p) => ({ ...p, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void handleSubmitHint();
              }}
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            <div style={rowStyle}>
              <label style={labelStyle}>Area <span style={{ color: "var(--danger)" }}>*</span></label>
              <input
                type="text"
                value={hintForm.gameArea}
                disabled={streaming}
                onChange={(e) => setHintForm((p) => ({ ...p, gameArea: e.target.value }))}
              />
            </div>
            <div style={rowStyle}>
              <label style={labelStyle}>Chapter <span style={{ color: "var(--danger)" }}>*</span></label>
              <input
                type="text"
                value={hintForm.chapter}
                disabled={streaming}
                onChange={(e) => setHintForm((p) => ({ ...p, chapter: e.target.value }))}
              />
            </div>
            <div style={rowStyle}>
              <label style={labelStyle}>Sub-area</label>
              <input
                type="text"
                placeholder="optional"
                value={hintForm.subArea}
                disabled={streaming}
                onChange={(e) => setHintForm((p) => ({ ...p, subArea: e.target.value }))}
              />
            </div>
          </div>

          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
            Ctrl+Enter to submit
          </p>

          <div>
            <button
              className="primary"
              disabled={streaming || !hintForm.text.trim()}
              onClick={() => void handleSubmitHint()}
            >
              {streaming ? "Receiving…" : "Get Hint"}
            </button>
          </div>
        </div>
      </div>

      {/* Streaming display */}
      {(streaming || (currentTokens && !streamError)) && (
        <div className="card">
          <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            {streaming ? "Receiving…" : "Response"}
          </p>
          <p style={{ fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>
            {currentTokens}
            {streaming && (
              <span style={{ display: "inline-block", width: "2px", height: "1em", background: "var(--accent)", marginLeft: "2px", verticalAlign: "text-bottom", animation: "ss-blink 0.75s step-end infinite" }} />
            )}
          </p>
          <style>{`@keyframes ss-blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
        </div>
      )}

      {/* Stream error */}
      {streamError && (
        <p className="error-msg" style={{ margin: 0 }}>⚠ {streamError}</p>
      )}

      {/* Hint log */}
      <div>
        <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1rem" }}>
          Hint log{" "}
          <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "13px" }}>
            ({history.length})
          </span>
        </h2>

        {history.length === 0 ? (
          <div className="card">
            <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: 0 }}>
              No hints yet — submit a question to begin.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {history.map((entry, i) => (
              <div key={entry.id} className="card" style={{ padding: "1rem 1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>#{i + 1}</span>
                  <span style={{ fontSize: "13px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.question}
                  </span>
                  {entry.refused ? (
                    <span className="badge failed">Refused</span>
                  ) : (
                    <span className="badge completed">{entry.lineCount}L</span>
                  )}
                </div>
                <p style={{
                  fontSize: "13px",
                  lineHeight: 1.7,
                  color: entry.refused ? "var(--text-muted)" : "var(--text)",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}>
                  {entry.response}
                  {entry.refusalReason && (
                    <span style={{ color: "var(--text-muted)", fontSize: "12px" }}> [{entry.refusalReason}]</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>
        {label}
      </span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
