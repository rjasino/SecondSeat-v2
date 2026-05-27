import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

import type { PlayerGoal } from "./run-context.model.js";

export interface IHintRequest extends Document {
  _id: Types.ObjectId;
  playSessionId: Types.ObjectId;
  rawInput: string;
  detectedIntent: PlayerGoal;
  createdAt: Date;
}

const hintRequestSchema = new Schema<IHintRequest>(
  {
    playSessionId: {
      type: Schema.Types.ObjectId,
      ref: "PlaySession",
      required: true,
      index: true,
    },
    rawInput: { type: String, required: true, maxlength: 500 },
    detectedIntent: {
      type: String,
      enum: ["progression", "exploration", "confirmation", "completion"],
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const HintRequestModel: Model<IHintRequest> =
  (mongoose.models["HintRequest"] as Model<IHintRequest>) ??
  mongoose.model<IHintRequest>("HintRequest", hintRequestSchema);
