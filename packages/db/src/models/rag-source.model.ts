import mongoose, { type Document, type Types, Schema, model } from 'mongoose';

export type SourceType = 'file' | 'url' | 'text';
export type SourceStatus = 'draft' | 'idle' | 'queued' | 'processing' | 'completed' | 'failed' | 'deleting';
export type SpoilerLevel = 'none' | 'low' | 'medium' | 'high';

export interface ISourceMetadata {
  game: string;
  area: string;
  spoilerLevel: SpoilerLevel;
  [key: string]: unknown;
}

export interface IRagSource extends Document {
  title: string;
  sourceType: SourceType;
  sourceUri?: string;
  content: string;
  createdBy: Types.ObjectId;
  metadata?: ISourceMetadata;
  status: SourceStatus;
  previousStatus?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ragSourceSchema = new Schema<IRagSource>(
  {
    title: { type: String, required: true },
    sourceType: { type: String, enum: ['file', 'url', 'text'], required: true },
    sourceUri: { type: String },
    content: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['draft', 'idle', 'queued', 'processing', 'completed', 'failed', 'deleting'],
      required: true,
      default: 'queued',
    },
    previousStatus: { type: String, default: null },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

ragSourceSchema.index({ status: 1, createdBy: 1 });

export const RagSource =
  (mongoose.models['RagSource'] as mongoose.Model<IRagSource>) ||
  model<IRagSource>('RagSource', ragSourceSchema);
