import mongoose, { type Document, Schema, model } from "mongoose";

export interface IUserPreferences {
  allowVoiceOutput: boolean;
  defaultOutputMode: "text" | "voice_optional";
  maxHintLines: number;
  repeatHintCooldownSeconds: number;
  autoRefuseSpoilers: boolean;
  confirmBeforeExplicitHint: boolean;
}

export interface IUserUiSettings {
  overlayEnabled: boolean;
  overlayPosition: "top" | "bottom" | "left" | "right";
  overlayOpacity: number;
  fontSize: "small" | "medium" | "large";
  theme: "dark" | "light" | "transparent";
}

export interface IUserProfile {
  displayName: string;
  primaryPlaystyle:
    | "explorer"
    | "completionist"
    | "narrative"
    | "challenge"
    | "time_limited";
  hintPhilosophy:
    | "minimal"
    | "directional"
    | "confirm_only"
    | "explicit_opt_in";
  spoilerTolerance: "none" | "low" | "medium" | "high";
  accessibilityNeeds: Record<string, unknown>;
  preferences: IUserPreferences;
  uiSettings: IUserUiSettings;
}

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: "user" | "admin" | "author";
  profile: IUserProfile;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "admin", "author"],
      required: true,
      default: "user",
    },
    profile: {
      displayName: { type: String, default: "" },
      primaryPlaystyle: {
        type: String,
        enum: [
          "explorer",
          "completionist",
          "narrative",
          "challenge",
          "time_limited",
        ],
        default: "explorer",
      },
      hintPhilosophy: {
        type: String,
        enum: ["minimal", "directional", "confirm_only", "explicit_opt_in"],
        default: "directional",
      },
      spoilerTolerance: {
        type: String,
        enum: ["none", "low", "medium", "high"],
        default: "low",
      },
      accessibilityNeeds: { type: Schema.Types.Mixed, default: {} },
      preferences: {
        allowVoiceOutput: { type: Boolean, default: false },
        defaultOutputMode: {
          type: String,
          enum: ["text", "voice_optional"],
          default: "text",
        },
        maxHintLines: { type: Number, default: 3 },
        repeatHintCooldownSeconds: { type: Number, default: 30 },
        autoRefuseSpoilers: { type: Boolean, default: true },
        confirmBeforeExplicitHint: { type: Boolean, default: true },
      },
      uiSettings: {
        overlayEnabled: { type: Boolean, default: false },
        overlayPosition: {
          type: String,
          enum: ["top", "bottom", "left", "right"],
          default: "bottom",
        },
        overlayOpacity: { type: Number, default: 0.9 },
        fontSize: {
          type: String,
          enum: ["small", "medium", "large"],
          default: "medium",
        },
        theme: {
          type: String,
          enum: ["dark", "light", "transparent"],
          default: "dark",
        },
      },
    },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export const User =
  (mongoose.models["User"] as mongoose.Model<IUser>) ||
  model<IUser>("User", userSchema);
