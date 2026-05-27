import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export interface IRagSource extends Document {
  _id: Types.ObjectId;
  title: string;
  sourceType: "file" | "url" | "text";
  sourceUri?: string;
  content?: string;
  createdBy?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  status:
    | "draft"
    | "idle"
    | "pending_review"
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "deleting";
  previousStatus?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ragSourceSchema = new Schema<IRagSource>(
  {
    title: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["file", "url", "text"],
      default: "text",
      required: true,
    },
    sourceUri: { type: String },
    content: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: [
        "draft",
        "idle",
        "pending_review",
        "queued",
        "processing",
        "completed",
        "failed",
        "deleting",
      ],
      default: "idle",
      required: true,
    },
    previousStatus: { type: String, default: null },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

ragSourceSchema.index(
  { "metadata.game": 1, "metadata.author": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "metadata.game": { $exists: true, $type: "string" },
      "metadata.author": { $exists: true, $type: "string" },
    },
  }
);

export const RagSourceModel: Model<IRagSource> =
  (mongoose.models["RagSource"] as Model<IRagSource>) ??
  mongoose.model<IRagSource>("RagSource", ragSourceSchema);
