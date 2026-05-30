import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export type RefusalReason =
  | "keyword_match"
  | "llm_refused"
  | "insufficient_context";

/**
 * Coarse classification of how a hint cycle resolved, for analytics.
 * - `answered`   — a normal situational hint was returned.
 * - `redirected` — an out-of-scope strategy/build question was steered back
 *   (the model emitted the redirect sentinel). NOT a refusal: `refused=false`.
 * - `refused`    — a spoiler/keyword/LLM refusal (pairs with `refusalReason`).
 */
export type HintOutcome = "answered" | "redirected" | "refused";

export interface IHintResponse extends Document {
  _id: Types.ObjectId;
  hintRequestId: Types.ObjectId;
  outputText: string;
  lineCount: number;
  outcome: HintOutcome;
  refused: boolean;
  refusalReason?: RefusalReason | null;
  audioUri?: string | null;
  createdAt: Date;
}

const hintResponseSchema = new Schema<IHintResponse>(
  {
    hintRequestId: {
      type: Schema.Types.ObjectId,
      ref: "HintRequest",
      required: true,
      index: true,
    },
    outputText: { type: String, required: true },
    lineCount: { type: Number, required: true, min: 1, max: 3 },
    outcome: {
      type: String,
      enum: ["answered", "redirected", "refused"],
      default: "answered",
      required: true,
    },
    refused: { type: Boolean, default: false, required: true },
    refusalReason: {
      type: String,
      enum: ["keyword_match", "llm_refused", "insufficient_context", null],
      default: null,
    },
    audioUri: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const HintResponseModel: Model<IHintResponse> =
  (mongoose.models["HintResponse"] as Model<IHintResponse>) ??
  mongoose.model<IHintResponse>("HintResponse", hintResponseSchema);
