import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export interface IRagDocument extends Document {
  _id: Types.ObjectId;
  sourceId: Types.ObjectId;
  chunkIndex: number;
  content: string;
  hash: string;
  vectorId?: string;
  metadata?: Record<string, unknown>;
  tokens?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ragDocumentSchema = new Schema<IRagDocument>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "RagSource", required: true },
    chunkIndex: { type: Number, default: 0, required: true },
    content: { type: String, required: true },
    hash: { type: String, required: true, index: true },
    vectorId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    tokens: { type: Number },
  },
  { timestamps: true }
);

ragDocumentSchema.index({ sourceId: 1, chunkIndex: 1 }, { unique: true });

export const RagDocumentModel: Model<IRagDocument> =
  (mongoose.models["RagDocument"] as Model<IRagDocument>) ??
  mongoose.model<IRagDocument>("RagDocument", ragDocumentSchema);
