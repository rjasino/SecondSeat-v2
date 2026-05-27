import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export interface IPreferences extends Document {
  _id: Types.ObjectId;
  profileId: Types.ObjectId;
  allowVoiceOutput: boolean;
  defaultOutputMode: "text" | "voice_optional";
  maxHintLines: number;
  repeatHintCooldownSeconds: number;
  autoRefuseSpoilers: boolean;
  confirmBeforeExplicitHint: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const preferencesSchema = new Schema<IPreferences>(
  {
    profileId: {
      type: Schema.Types.ObjectId,
      ref: "Profile",
      required: true,
      unique: true,
    },
    allowVoiceOutput: { type: Boolean, default: false, required: true },
    defaultOutputMode: {
      type: String,
      enum: ["text", "voice_optional"],
      required: true,
    },
    maxHintLines: { type: Number, default: 3, required: true },
    repeatHintCooldownSeconds: { type: Number, required: true },
    autoRefuseSpoilers: { type: Boolean, default: false, required: true },
    confirmBeforeExplicitHint: { type: Boolean, default: false, required: true },
  },
  { timestamps: true }
);

export const PreferencesModel: Model<IPreferences> =
  (mongoose.models["Preferences"] as Model<IPreferences>) ??
  mongoose.model<IPreferences>("Preferences", preferencesSchema);
