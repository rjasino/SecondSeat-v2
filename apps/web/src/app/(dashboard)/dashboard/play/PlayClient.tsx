"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useVoiceStt } from "@/lib/play/use-voice-stt";

interface GameOption {
  id: string;
  title: string;
  slug: string;
}

// --- Types ---
type PlayerGoal = "progression" | "exploration" | "confirmation" | "completion";
type ConfidenceLevel = "confident" | "uncertain" | "stuck";
type HintOutcome = "answered" | "redirected" | "refused";

const SUBAREA_NONE = "none";

interface SerializedRunContext {
  id: string;
  gameArea: string;
  chapter?: string;
  subArea: string;
  playerGoal: PlayerGoal;
  confidenceLevel: ConfidenceLevel;
}

interface SessionState {
  playSessionId: string;
  runContextId: string;
  gameId: string;
  gameTitle: string;
}

/** The editable run-context fields shown on the Request Screen. */
interface ContextForm {
  gameArea: string;
  subArea: string;
  noSubArea: boolean; // "No sub-area / whole area" → submits the "none" sentinel
  playerGoal: PlayerGoal;
  confidenceLevel: ConfidenceLevel;
}

interface HintEntry {
  id: string;
  question: string;
  response: string;
  lineCount: number;
  outcome: HintOutcome;
  refused: boolean;
  refusalReason: string | null;
}

// --- Helpers ---
function clientId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Derives the local ContextForm from a loaded run context. */
function formFromContext(rc: SerializedRunContext): ContextForm {
  const isNone = rc.subArea.trim().toLowerCase() === SUBAREA_NONE;
  return {
    gameArea: rc.gameArea === "Start" ? "" : rc.gameArea,
    subArea: isNone ? "" : rc.subArea,
    noSubArea: isNone,
    playerGoal: rc.playerGoal,
    confidenceLevel: rc.confidenceLevel,
  };
}

const blankForm: ContextForm = {
  gameArea: "",
  subArea: "",
  noSubArea: false,
  playerGoal: "progression",
  confidenceLevel: "uncertain",
};

// Shared styles matching the rest of the dashboard
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
  const [games, setGames] = useState<GameOption[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json() as Promise<GameOption[]>)
      .then(setGames)
      .catch(() => {
        /* keep empty */
      });
  }, []);

  const [setupGameId, setSetupGameId] = useState("");
  const [setupBusy, setSetupBusy] = useState<"new" | "load" | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [contextForm, setContextForm] = useState<ContextForm>(blankForm);
  const [question, setQuestion] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [streaming, setStreaming] = useState(false);
  const [currentTokens, setCurrentTokens] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [history, setHistory] = useState<HintEntry[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const { pending: micPending, listening, supported, interimTranscript, start: startVoice } = useVoiceStt(
    useCallback((text: string) => {
      setQuestion(text);
      setFormErrors((fe) => ({ ...fe, question: "" }));
    }, [])
  );

  const resetStreamState = useCallback(() => {
    setHistory([]);
    setCurrentTokens("");
    setStreamError(null);
    setQuestion("");
    setFormErrors({});
  }, []);

  // --- New run ---
  const handleNewRun = useCallback(async () => {
    if (!setupGameId) {
      setSetupError("Please select a game.");
      return;
    }
    setSetupBusy("new");
    setSetupError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: setupGameId }),
      });
      if (!res.ok) {
        setSetupError("Could not start a new run. Are you signed in?");
        return;
      }
      const data = (await res.json()) as {
        playSessionId: string;
        runContext: SerializedRunContext;
      };
      const game = games.find((g) => g.id === setupGameId);
      setSession({
        playSessionId: data.playSessionId,
        runContextId: data.runContext.id,
        gameId: setupGameId,
        gameTitle: game?.title ?? setupGameId,
      });
      setContextForm(blankForm); // new run opens blank — start of game
      resetStreamState();
      setShowSetup(false);
    } catch {
      setSetupError("Connection error — could not start a run.");
    } finally {
      setSetupBusy(null);
    }
  }, [setupGameId, games, resetStreamState]);

  // --- Load run ---
  const handleLoadRun = useCallback(async () => {
    if (!setupGameId) {
      setSetupError("Please select a game.");
      return;
    }
    setSetupBusy("load");
    setSetupError(null);
    try {
      const res = await fetch(
        `/api/sessions/active?gameId=${encodeURIComponent(setupGameId)}`
      );
      if (res.status === 404) {
        setSetupError("No active run for this game — start a new one.");
        return;
      }
      if (!res.ok) {
        setSetupError("Could not load your run.");
        return;
      }
      const data = (await res.json()) as {
        playSessionId: string;
        runContext: SerializedRunContext;
      };
      const game = games.find((g) => g.id === setupGameId);
      setSession({
        playSessionId: data.playSessionId,
        runContextId: data.runContext.id,
        gameId: setupGameId,
        gameTitle: game?.title ?? setupGameId,
      });
      setContextForm(formFromContext(data.runContext)); // prefilled, editable
      resetStreamState();
      setShowSetup(false);
    } catch {
      setSetupError("Connection error — could not load a run.");
    } finally {
      setSetupBusy(null);
    }
  }, [setupGameId, games, resetStreamState]);

  const handleNewSession = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setSession(null);
    setSetupGameId("");
    setSetupError(null);
    resetStreamState();
    setShowSetup(true);
  }, [resetStreamState]);

  /** The effective sub-area sent to the backend ("none" when toggled off). */
  const effectiveSubArea = (f: ContextForm): string =>
    f.noSubArea ? SUBAREA_NONE : f.subArea.trim();

  // --- Hint submit ---
  const handleSubmitHint = useCallback(async () => {
    if (!session || streaming) return;

    const errors: Record<string, string> = {};
    if (!contextForm.gameArea.trim()) errors["gameArea"] = "Area is required.";
    if (!contextForm.noSubArea && !contextForm.subArea.trim())
      errors["subArea"] = "Sub-area is required (or tick “No sub-area”).";
    if (!question.trim()) errors["question"] = "Enter a question.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const text = question.trim();
    const gameArea = contextForm.gameArea.trim();
    const subArea = effectiveSubArea(contextForm);

    // Persist the run context in place (best-effort — never block the hint).
    try {
      await fetch(`/api/run-context/${session.runContextId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameArea,
          subArea,
          playerGoal: contextForm.playerGoal,
          confidenceLevel: contextForm.confidenceLevel,
        }),
      });
    } catch {
      console.warn("[play] run-context update failed — continuing to hint");
    }

    const body = {
      playSessionId: session.playSessionId,
      runContextId: session.runContextId,
      gameId: session.gameId,
      gameArea,
      subArea,
      playerGoal: contextForm.playerGoal,
      confidenceLevel: contextForm.confidenceLevel,
      text,
    };

    setStreaming(true);
    setCurrentTokens("");
    setStreamError(null);
    setQuestion("");

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
        const err = (await res
          .json()
          .catch(() => ({ error: "Request failed" }))) as Record<string, unknown>;
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
                const outcome: HintOutcome =
                  payload.outcome === "redirected" ||
                  payload.outcome === "refused" ||
                  payload.outcome === "answered"
                    ? payload.outcome
                    : refused
                      ? "refused"
                      : "answered";
                const refusalReason =
                  typeof payload.refusalReason === "string"
                    ? payload.refusalReason
                    : null;
                const lineCount =
                  typeof payload.lineCount === "number" ? payload.lineCount : 1;
                setHistory((prev) => [
                  ...prev,
                  {
                    id: clientId(),
                    question: text,
                    response: accumulated,
                    lineCount,
                    outcome,
                    refused,
                    refusalReason,
                  },
                ]);
                setCurrentTokens("");
                setStreaming(false);
                lastEvent = "";
                break loop;
              } else if (lastEvent === "error") {
                setStreamError(
                  typeof payload.message === "string"
                    ? payload.message
                    : "Hint generation failed."
                );
                setStreaming(false);
                lastEvent = "";
                break loop;
              } else if (typeof payload.token === "string") {
                accumulated += payload.token;
                setCurrentTokens((prev) => prev + (payload.token as string));
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
  }, [session, streaming, contextForm, question]);

  // ---- No session, no setup ----
  if (!session && !showSetup) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "0.25rem" }}>
            Play
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Ask SecondSeat for a situational nudge — tell it where you are, then what
            you&apos;re stuck on.
          </p>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            No active run. Start one to begin asking for hints.
          </p>
          <div>
            <button className="primary" onClick={() => setShowSetup(true)}>
              Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Setup: pick game → New run / Load run ----
  if (showSetup && !session) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "0.25rem" }}>
            Play
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Pick the game you&apos;re playing, then start a fresh run or load your
            current one.
          </p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1.25rem" }}>
            Choose game
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={rowStyle}>
              <label style={labelStyle}>
                Game <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                value={setupGameId}
                onChange={(e) => {
                  setSetupGameId(e.target.value);
                  setSetupError(null);
                }}
              >
                <option value="">— Select game —</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>

            {setupError && <p className="error-msg">{setupError}</p>}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                className="primary"
                disabled={setupBusy !== null}
                onClick={() => void handleNewRun()}
              >
                {setupBusy === "new" ? "Starting…" : "New run"}
              </button>
              <button
                className="ghost"
                disabled={setupBusy !== null}
                onClick={() => void handleLoadRun()}
              >
                {setupBusy === "load" ? "Loading…" : "Load run"}
              </button>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
              New run starts you at the beginning of the game. Load run restores your
              last saved area.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Active run: Request Screen ----
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "0.25rem" }}>Play</h1>
          <p style={{ color: "var(--text-muted)" }}>
            {session!.gameTitle} — set where you are, then ask.
          </p>
        </div>
        <button className="ghost" onClick={handleNewSession} style={{ flexShrink: 0 }}>
          New Session
        </button>
      </div>

      {/* Request Screen — context + question on one screen */}
      <div className="card">
        <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "1rem" }}>Ask a hint</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Where are you */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div style={rowStyle}>
              <label style={labelStyle}>
                Area <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Clock Tower"
                value={contextForm.gameArea}
                disabled={streaming}
                onChange={(e) => {
                  setContextForm((p) => ({ ...p, gameArea: e.target.value }));
                  setFormErrors((fe) => ({ ...fe, gameArea: "" }));
                }}
              />
              {formErrors["gameArea"] && <p className="error-msg">{formErrors["gameArea"]}</p>}
            </div>
            <div style={rowStyle}>
              <label style={labelStyle}>
                Sub-area <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 3rd Floor"
                value={contextForm.noSubArea ? "" : contextForm.subArea}
                disabled={streaming || contextForm.noSubArea}
                onChange={(e) => {
                  setContextForm((p) => ({ ...p, subArea: e.target.value }));
                  setFormErrors((fe) => ({ ...fe, subArea: "" }));
                }}
              />
              <label
                style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}
              >
                <input
                  type="checkbox"
                  checked={contextForm.noSubArea}
                  disabled={streaming}
                  onChange={(e) => {
                    setContextForm((p) => ({ ...p, noSubArea: e.target.checked }));
                    setFormErrors((fe) => ({ ...fe, subArea: "" }));
                  }}
                />
                No sub-area / whole area
              </label>
              {formErrors["subArea"] && <p className="error-msg">{formErrors["subArea"]}</p>}
            </div>
          </div>

          {/* Goal + confidence (dropdowns, unchanged) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div style={rowStyle}>
              <label style={labelStyle}>Player Goal</label>
              <select
                value={contextForm.playerGoal}
                disabled={streaming}
                onChange={(e) =>
                  setContextForm((p) => ({ ...p, playerGoal: e.target.value as PlayerGoal }))
                }
              >
                <option value="progression">Progression</option>
                <option value="exploration">Exploration</option>
                <option value="confirmation">Confirmation</option>
                <option value="completion">Completion</option>
              </select>
            </div>
            <div style={rowStyle}>
              <label style={labelStyle}>Confidence</label>
              <select
                value={contextForm.confidenceLevel}
                disabled={streaming}
                onChange={(e) =>
                  setContextForm((p) => ({
                    ...p,
                    confidenceLevel: e.target.value as ConfidenceLevel,
                  }))
                }
              >
                <option value="confident">Confident</option>
                <option value="uncertain">Uncertain</option>
                <option value="stuck">Stuck</option>
              </select>
            </div>
          </div>

          {/* Question */}
          <div style={rowStyle}>
            <label style={labelStyle}>
              Question <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
              <textarea
                rows={3}
                placeholder="e.g. I can't figure out the puzzle here"
                value={question}
                disabled={streaming}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setFormErrors((fe) => ({ ...fe, question: "" }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void handleSubmitHint();
                }}
                style={{
                  resize: "vertical",
                  flex: 1,
                  outline: listening ? "2px solid var(--accent)" : undefined,
                  outlineOffset: "1px",
                  transition: "outline 0.1s",
                }}
              />
              <MicButton
                pending={micPending}
                listening={listening}
                supported={supported}
                disabled={streaming}
                onClick={startVoice}
              />
            </div>
            <MicStatus pending={micPending} listening={listening} interim={interimTranscript} />
            {formErrors["question"] && <p className="error-msg">{formErrors["question"]}</p>}
          </div>

          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>Ctrl+Enter to submit</p>

          <div>
            <button className="primary" disabled={streaming} onClick={() => void handleSubmitHint()}>
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
      {streamError && <p className="error-msg" style={{ margin: 0 }}>⚠ {streamError}</p>}

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
            {[...history].reverse().map((entry, i) => (
              <div key={entry.id} className="card" style={{ padding: "1rem 1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>#{history.length - i}</span>
                  <span style={{ fontSize: "13px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.question}
                  </span>
                  <OutcomeBadge entry={entry} />
                </div>
                <p style={{
                  fontSize: "13px",
                  lineHeight: 1.7,
                  color: entry.outcome === "answered" ? "var(--text)" : "var(--text-muted)",
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

interface MicButtonProps {
  pending: boolean;
  listening: boolean;
  supported: boolean;
  disabled: boolean;
  onClick: () => void;
}

function MicButton({ pending, listening, supported, disabled, onClick }: MicButtonProps) {
  const isDisabled = disabled || !supported || pending;
  const tooltip = !supported
    ? "Voice input requires a Chromium-based browser"
    : pending
      ? "Connecting to mic…"
      : listening
        ? "Stop recording"
        : "Push to talk";

  return (
    <button
      type="button"
      title={tooltip}
      disabled={isDisabled}
      onClick={onClick}
      aria-label={tooltip}
      style={{
        flexShrink: 0,
        width: "36px",
        height: "36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "6px",
        border: `1px solid ${listening ? "var(--accent)" : pending ? "var(--accent)" : "var(--border)"}`,
        background: listening ? "var(--accent)" : "var(--surface-2, var(--card-bg))",
        color: listening ? "#fff" : pending ? "var(--accent)" : "var(--text-muted)",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: disabled || (!supported && !listening) ? 0.45 : 1,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        padding: 0,
        animation: pending ? "ss-mic-pulse 0.9s ease-in-out infinite" : undefined,
      }}
    >
      {listening ? <StopIcon /> : <MicIcon />}
      <style>{`@keyframes ss-mic-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
    </button>
  );
}

interface MicStatusProps {
  pending: boolean;
  listening: boolean;
  interim: string;
}

function MicStatus({ pending, listening, interim }: MicStatusProps) {
  // Flash "Speak now" for 1.5 s after listening begins, then settle to normal.
  const [speakNow, setSpeakNow] = useState(false);
  const prevListening = useRef(false);

  useEffect(() => {
    if (listening && !prevListening.current) {
      setSpeakNow(true);
      const t = setTimeout(() => setSpeakNow(false), 1500);
      prevListening.current = true;
      return () => clearTimeout(t);
    }
    if (!listening) prevListening.current = false;
  }, [listening]);

  const content = useMemo(() => {
    if (pending) return { text: "Connecting mic…", color: "var(--accent)", pulse: true };
    if (listening && speakNow) return { text: "● Speak now", color: "var(--accent)", pulse: false };
    if (listening && interim) return { text: `${interim}…`, color: "var(--text-muted)", pulse: false };
    if (listening) return { text: "● Recording", color: "var(--accent)", pulse: false };
    return null;
  }, [pending, listening, speakNow, interim]);

  if (!content) {
    return null;
  }

  return (
    <p
      style={{
        fontSize: "12px",
        margin: "4px 0 0",
        fontStyle: content.text.startsWith("●") ? "normal" : "italic",
        color: content.color,
        animation: content.pulse ? "ss-mic-pulse 0.9s ease-in-out infinite" : undefined,
        transition: "color 0.15s",
      }}
    >
      {content.text}
      <style>{`@keyframes ss-mic-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
    </p>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function OutcomeBadge({ entry }: { entry: HintEntry }) {
  if (entry.outcome === "refused") return <span className="badge failed">Refused</span>;
  if (entry.outcome === "redirected") return <span className="badge">Redirected</span>;
  return <span className="badge completed">{entry.lineCount}L</span>;
}
