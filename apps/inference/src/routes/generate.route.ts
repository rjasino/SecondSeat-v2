import { Router } from "express";
import { generateRateLimiter } from "../middleware/rate-limit.middleware.js";
import { generateSchema } from "../schemas/generate.schema.js";
import { checkKeywords } from "../services/spoiler/spoiler-check.service.js";
import { retrieveChunks } from "../services/retrieval/retrieval.service.js";
import { buildPrompt } from "../services/prompt/prompt-template.js";
import { getLlmAdapter } from "../services/llm/index.js";
import {
  insertHintRequest,
  insertHintResponse,
} from "../services/persistence/hint-log.service.js";
import { inferenceConfig } from "../config/config.js";
import type { RefusalReason } from "@secondseat/db";

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
        refused: true,
        refusalReason: reason,
      });

      sendSseEvent(res, "done", {
        lineCount: countLines(trimmed) || 1,
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
      chunks = await retrieveChunks(body.text, body.gameId);
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

    // --- 8. Assemble prompt ---
    const { systemPrompt, userPrompt } = buildPrompt({
      playerQuestion: body.text,
      retrievedChunks: chunks,
      runContext: {
        gameArea: body.gameArea,
        chapter: body.chapter,
        subArea: body.subArea,
        playerGoal: body.playerGoal,
        confidenceLevel: body.confidenceLevel,
      },
      sessionMemory: "", // Stubbed until IF-E ships
    });

    // --- 9. Stream LLM response ---
    const adapter = getLlmAdapter();
    let accumulated = "";
    let llmRefused = false;

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

    // --- 11. Persist hint_response (fire-and-forget — failures are swallowed) ---
    await insertHintResponse({
      hintRequestId,
      outputText: trimmed,
      lineCount,
      refused,
      refusalReason,
    });

    // --- 12. Emit terminal done event ---
    sendSseEvent(res, "done", { lineCount, refused, refusalReason });
    res.end();
  }
);
