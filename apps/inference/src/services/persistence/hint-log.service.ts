import { HintRequestModel, HintResponseModel } from "@secondseat/db";
import type { PlayerGoal, RefusalReason } from "@secondseat/db";

export interface InsertHintRequestParams {
  playSessionId: string;
  rawInput: string;
  detectedIntent: PlayerGoal;
}

export interface InsertHintResponseParams {
  hintRequestId: string;
  outputText: string;
  lineCount: number;
  refused: boolean;
  refusalReason: RefusalReason | null;
}

/**
 * Inserts a hint_requests document at the start of the hint cycle.
 * Returns the inserted document's _id as a string.
 */
export async function insertHintRequest(
  params: InsertHintRequestParams
): Promise<string> {
  const doc = await HintRequestModel.create({
    playSessionId: params.playSessionId,
    rawInput: params.rawInput,
    detectedIntent: params.detectedIntent,
  });
  return String(doc._id);
}

/**
 * Inserts a hint_responses document after the SSE stream completes.
 * DB write failures are caught, logged, and swallowed — not surfaced to the player.
 */
export async function insertHintResponse(
  params: InsertHintResponseParams
): Promise<void> {
  try {
    await HintResponseModel.create({
      hintRequestId: params.hintRequestId,
      outputText: params.outputText,
      lineCount: params.lineCount,
      refused: params.refused,
      refusalReason: params.refusalReason,
      audioUri: null,
    });
  } catch (err) {
    console.error("[persistence] Failed to write hint_response:", err);
    // Intentionally not re-thrown — player has already received the streamed hint.
  }
}
