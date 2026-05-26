import mongoose, { type Document, type Types, Schema, model } from 'mongoose';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface IRagIngestionJob extends Document {
  sourceId: Types.ObjectId;
  queueJobUuid: string;
  status: JobStatus;
  totalChunks?: number;
  processedChunks: number;
  progress?: number;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ragIngestionJobSchema = new Schema<IRagIngestionJob>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: 'RagSource', required: true },
    queueJobUuid: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      required: true,
      default: 'queued',
    },
    totalChunks: { type: Number },
    processedChunks: { type: Number, default: 0 },
    progress: { type: Number },
    error: { type: String },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

ragIngestionJobSchema.index({ sourceId: 1, createdAt: -1 });

export const RagIngestionJob =
  (mongoose.models['RagIngestionJob'] as mongoose.Model<IRagIngestionJob>) ||
  model<IRagIngestionJob>('RagIngestionJob', ragIngestionJobSchema);
