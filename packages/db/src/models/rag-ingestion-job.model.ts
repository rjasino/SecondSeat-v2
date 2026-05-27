import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export interface IRagIngestionJob extends Document {
  _id: Types.ObjectId;
  sourceId: Types.ObjectId;
  queueJobUuid?: string;
  status: "queued" | "processing" | "completed" | "failed";
  totalChunks: number;
  processedChunks: number;
  progress: number;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ragIngestionJobSchema = new Schema<IRagIngestionJob>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "RagSource", required: true },
    queueJobUuid: { type: String },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      required: true,
    },
    totalChunks: { type: Number, default: 0 },
    processedChunks: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    error: { type: String },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

export const RagIngestionJobModel: Model<IRagIngestionJob> =
  (mongoose.models["RagIngestionJob"] as Model<IRagIngestionJob>) ??
  mongoose.model<IRagIngestionJob>("RagIngestionJob", ragIngestionJobSchema);
