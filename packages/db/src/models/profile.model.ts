import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export type Playstyle =
  | "explorer"
  | "completionist"
  | "narrative"
  | "challenge"
  | "time_limited";

export type HintPhilosophy =
  | "minimal"
  | "directional"
  | "confirm_only"
  | "explicit_opt_in";

export type SpoilerTolerance = "none" | "low" | "medium" | "high";

export interface IProfile extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  displayName: string;
  primaryPlaystyle: Playstyle;
  hintPhilosophy: HintPhilosophy;
  spoilerTolerance: SpoilerTolerance;
  accessibilityNeeds?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    displayName: { type: String, required: true },
    primaryPlaystyle: {
      type: String,
      enum: ["explorer", "completionist", "narrative", "challenge", "time_limited"],
      required: true,
    },
    hintPhilosophy: {
      type: String,
      enum: ["minimal", "directional", "confirm_only", "explicit_opt_in"],
      required: true,
    },
    spoilerTolerance: {
      type: String,
      enum: ["none", "low", "medium", "high"],
      required: true,
    },
    accessibilityNeeds: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const ProfileModel: Model<IProfile> =
  (mongoose.models["Profile"] as Model<IProfile>) ??
  mongoose.model<IProfile>("Profile", profileSchema);
