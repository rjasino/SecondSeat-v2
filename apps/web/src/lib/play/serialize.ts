import type { PlayerGoal, ConfidenceLevel } from "@/models/run-context.model";

export interface SerializedRunContext {
  id: string;
  gameArea: string;
  chapter?: string;
  subArea: string;
  playerGoal: PlayerGoal;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Structural shape accepted by the serializer — satisfied by both a hydrated
 * Mongoose document and a `.lean()` plain object.
 */
export interface RunContextLike {
  _id: { toString(): string };
  gameArea: string;
  chapter?: string | null;
  subArea: string;
  playerGoal: PlayerGoal;
  confidenceLevel: ConfidenceLevel;
}

/** Projects a RunContext document into the JSON shape the Request Screen consumes. */
export function serializeRunContext(doc: RunContextLike): SerializedRunContext {
  return {
    id: doc._id.toString(),
    gameArea: doc.gameArea,
    ...(doc.chapter ? { chapter: doc.chapter } : {}),
    subArea: doc.subArea,
    playerGoal: doc.playerGoal,
    confidenceLevel: doc.confidenceLevel,
  };
}
