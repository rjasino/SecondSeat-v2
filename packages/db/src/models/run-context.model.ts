import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export type PlayerGoal =
  | "progression"
  | "exploration"
  | "confirmation"
  | "completion";

export type ConfidenceLevel = "confident" | "uncertain" | "stuck";

export interface IRunContext extends Document {
  _id: Types.ObjectId;
  playSessionId: Types.ObjectId;
  gameArea: string;
  chapter?: string;
  subArea: string;
  playerGoal: PlayerGoal;
  confidenceLevel: ConfidenceLevel;
  createdAt: Date;
  updatedAt: Date;
}

const runContextSchema = new Schema<IRunContext>(
  {
    playSessionId: {
      type: Schema.Types.ObjectId,
      ref: "PlaySession",
      required: true,
      index: true,
    },
    gameArea: { type: String, required: true },
    chapter: { type: String },
    subArea: { type: String, required: true },
    playerGoal: {
      type: String,
      enum: ["progression", "exploration", "confirmation", "completion"],
      required: true,
    },
    confidenceLevel: {
      type: String,
      enum: ["confident", "uncertain", "stuck"],
      required: true,
    },
  },
  { timestamps: true }
);

export const RunContextModel: Model<IRunContext> =
  (mongoose.models["RunContext"] as Model<IRunContext>) ??
  mongoose.model<IRunContext>("RunContext", runContextSchema);
