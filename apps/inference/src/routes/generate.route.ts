import { Router } from "express";
import { generateRateLimiter } from "../middleware/rate-limit.middleware.js";
import { generateSchema } from "../schemas/generate.schema.js";
import { checkKeywords } from "../services/spoiler/spoiler-check.service.js";
import { retrieveChunks } from "../services/retrieval/retrieval.service.js";
import {
  buildPrompt,
  REDIRECT_SENTINEL,
} from "../services/prompt/prompt-template.js";
import { getLlmAdapter } from "../services/llm/index.js";
import {
  insertHintRequest,
  insertHintResponse,
} from "../services/persistence/hint-log.service.js";
import { inferenceConfig } from "../config/config.js";
import {
  GameModel,
  PlaySessionModel,
  ProfileModel,
  PreferencesModel,
  type HintOutcome,
  type RefusalReason,
} from "@secondseat/db";
import { DEFAULT_PROFILE, DEFAULT_PREFERENCES } from "../lib/defaults.js";
import type {
  PromptGame,
  PromptProfile,
  PromptPreferences,
} from "../services/prompt/prompt-template.js";

export const generateRouter = Router();

const REFUSAL_MESSAGE =
  "I can't help with that without spoiling something important. Try asking about your immediate next step or a specific area.";

const INSUFFICIENT_CONTEXT_MESSAGE =
  "I don't have enough guide information to help with that. Try rephrasing your question or asking about a specific area or puzzle.";

/** Trims accumulated LLM output to a maximum of 3 non-empty lines. */
function trimToThreeLines(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.slice(0, 3).join("\n");
}

function countLines(text: string): number {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;
}

function sendSseToken(res: import("express").Response, token: string): void {
  res.write(`data: ${JSON.stringify({ token })}\n\n`);
}

function sendSseEvent(
  res: import("express").Response,
  event: string,
  data: unknown
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

generateRouter.post(
  "/",
  generateRateLimiter,
  async (req, res) => {
    // --- 1. Validate request body ---
    const parseResult = generateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(422).json({
        error: "VALIDATION_ERROR",
        details: parseResult.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
      return;
    }
    const body = parseResult.data;

    // --- 2. Open SSE stream ---
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // --- 3. Setup abort controller (client disconnect + LLM timeout) ---
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      inferenceConfig.LLM_TIMEOUT_MS
    );
    req.on("close", () => {
      clearTimeout(timeoutId);
      abortController.abort();
    });

    // Helper: emit a refused cycle and close the stream
    const emitRefusal = async (
      reason: RefusalReason,
      message: string,
      hintRequestId?: string
    ) => {
      clearTimeout(timeoutId);
      const trimmed = trimToThreeLines(message);

      if (!hintRequestId) {
        // Insert hint_request before persisting the refusal
        hintRequestId = await insertHintRequest({
          playSessionId: body.playSessionId,
          rawInput: body.text,
          detectedIntent: body.playerGoal,
        }).catch((err) => {
          console.error("[generate] Failed to insert hint_request:", err);
          return "000000000000000000000000"; // fallback id to not block the response
        });
      }

      await insertHintResponse({
        hintRequestId,
        outputText: trimmed,
        lineCount: countLines(trimmed) || 1,
        outcome: "refused",
        refused: true,
        refusalReason: reason,
      });

      sendSseEvent(res, "done", {
        lineCount: countLines(trimmed) || 1,
        outcome: "refused",
        refused: true,
        refusalReason: reason,
      });
      res.end();
    };

    // --- 4. Keyword spoiler pre-check ---
    if (checkKeywords(body.text)) {
      await emitRefusal("keyword_match", REFUSAL_MESSAGE);
      return;
    }

    // --- 5. ChromaDB retrieval ---
    let chunks;
    try {
      chunks = await retrieveChunks(body.text, body.gameId, {
        gameArea: body.gameArea,
        chapter: body.chapter, // optional — undefined when omitted; downstream filters handle it
        subArea: body.subArea,
        playerGoal: body.playerGoal,
      });
    } catch (err) {
      console.error("[generate] Retrieval failed:", err);
      await emitRefusal("insufficient_context", INSUFFICIENT_CONTEXT_MESSAGE);
      return;
    }

    if (chunks.length === 0) {
      await emitRefusal("insufficient_context", INSUFFICIENT_CONTEXT_MESSAGE);
      return;
    }

    // --- 6. Check if ALL chunks are spoiler-tagged ---
    const allSpoiler = chunks.every((c) => c.spoiler);
    if (allSpoiler) {
      await emitRefusal("llm_refused", REFUSAL_MESSAGE);
      return;
    }

    // --- 7. Insert hint_request (start of LLM cycle) ---
    let hintRequestId: string;
    try {
      hintRequestId = await insertHintRequest({
        playSessionId: body.playSessionId,
        rawInput: body.text,
        detectedIntent: body.playerGoal,
      });
    } catch (err) {
      console.error("[generate] Failed to insert hint_request:", err);
      hintRequestId = "000000000000000000000000"; // non-fatal; continue
    }

    // --- 7b. Load player context for the prompt ---
    // Game is required — an unknown gameId is a real client error, not a
    // missing-user-data row, so we don't fall back.
    const gameDoc = await GameModel.findById(body.gameId)
      .select("title")
      .lean();
    if (!gameDoc) {
      console.error(`[generate] Game not found for gameId=${body.gameId}`);
      await emitRefusal(
        "insufficient_context",
        INSUFFICIENT_CONTEXT_MESSAGE,
        hintRequestId
      );
      return;
    }
    const promptGame: PromptGame = { title: gameDoc.title };

    // Profile / Preferences: tolerated missing. Apply defaults + log a
    // grep-able token per request so demo logs are countable.
    const playSession = await PlaySessionModel.findById(body.playSessionId)
      .select("userId")
      .lean();

    let promptProfile: PromptProfile = DEFAULT_PROFILE;
    let profileId: string | null = null;
    if (playSession?.userId) {
      const profile = await ProfileModel.findOne({
        userId: playSession.userId,
      }).lean();
      if (profile) {
        profileId = profile._id.toString();
        promptProfile = {
          hintPhilosophy: profile.hintPhilosophy,
          spoilerTolerance: profile.spoilerTolerance,
        };
      } else {
        console.warn(
          `[generate] profile_missing userId=${String(playSession.userId)} — falling back to defaults`
        );
      }
    } else {
      console.warn(
        `[generate] profile_missing playSessionId=${body.playSessionId} (no playSession or userId) — falling back to defaults`
      );
    }

    let promptPreferences: PromptPreferences = DEFAULT_PREFERENCES;
    if (profileId) {
      const prefs = await PreferencesModel.findOne({
        profileId,
      }).lean();
      if (prefs) {
        promptPreferences = { maxHintLines: prefs.maxHintLines };
      } else {
        console.warn(
          `[generate] preferences_missing profileId=${profileId} — falling back to defaults`
        );
      }
    } else {
      console.warn(
        `[generate] preferences_missing (no profile) — falling back to defaults`
      );
    }

    // --- 8. Assemble prompt ---
    const { systemPrompt, userPrompt } = buildPrompt({
      playerQuestion: body.text,
      retrievedChunks: chunks,
      runContext: {
        gameArea: body.gameArea,
        chapter: body.chapter, // optional; formatRunContext omits the Chapter: line when absent
        subArea: body.subArea,
        playerGoal: body.playerGoal,
        confidenceLevel: body.confidenceLevel,
      },
      game: promptGame,
      profile: promptProfile,
      preferences: promptPreferences,
      sessionMemory: "", // Stubbed until IF-E ships
    });

    // --- 9. Stream LLM response ---
    const adapter = getLlmAdapter();
    let accumulated = "";
    let llmRefused = false;
    let redirected = false;

    // LLM self-refusal signal embedded in the response
    const LLM_REFUSAL_SIGNAL =
      "I can't help with that without spoiling something important";

    try {
      for await (const token of adapter.streamGenerate(
        systemPrompt,
        userPrompt,
        { abortSignal: abortController.signal }
      )) {
        if (abortController.signal.aborted) break;

        accumulated += token;
        sendSseToken(res, token);

        // Detect LLM self-refusal mid-stream
        if (accumulated.includes(LLM_REFUSAL_SIGNAL)) {
          llmRefused = true;
          break;
        }

        // Detect an out-of-scope redirect (not a refusal)
        if (accumulated.includes(REDIRECT_SENTINEL)) {
          redirected = true;
          break;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("[generate] LLM stream error:", err);
      sendSseEvent(res, "error", { message: "Hint generation failed." });
      res.end();
      return;
    }

    clearTimeout(timeoutId);

    // --- 10. Post-stream processing ---
    const trimmed = trimToThreeLines(accumulated);
    const lineCount = Math.max(1, countLines(trimmed));
    const refused = llmRefused;
    const refusalReason: RefusalReason | null = refused ? "llm_refused" : null;
    // Outcome precedence: a refusal always wins over a redirect; a redirect
    // wins over a normal answer. Redirects are NOT refusals (refused stays false).
    const outcome: HintOutcome = refused
      ? "refused"
      : redirected
        ? "redirected"
        : "answered";

    // --- 11. Persist hint_response (fire-and-forget — failures are swallowed) ---
    await insertHintResponse({
      hintRequestId,
      outputText: trimmed,
      lineCount,
      outcome,
      refused,
      refusalReason,
    });

    // --- 12. Emit terminal done event ---
    sendSseEvent(res, "done", { lineCount, outcome, refused, refusalReason });
    res.end();
  }
);
