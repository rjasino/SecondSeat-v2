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

export interface IHintResponse extends Document {
  _id: Types.ObjectId;
  hintRequestId: Types.ObjectId;
  outputText: string;
  lineCount: number;
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
