import mongoose, { type Document, type Types, Schema, model } from 'mongoose';

import type { ISourceMetadata } from './rag-source.model.js';

export interface IRagDocument extends Document {
  sourceId: Types.ObjectId;
  chunkIndex: number;
  content: string;
  hash: string;
  vectorId: string;
  metadata: ISourceMetadata;
  tokens: number;
  createdAt: Date;
  updatedAt: Date;
}

const ragDocumentSchema = new Schema<IRagDocument>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: 'RagSource', required: true },
    chunkIndex: { type: Number, required: true, min: 0 },
    content: { type: String, required: true },
    hash: { type: String, required: true },
    vectorId: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, required: true },
    tokens: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

ragDocumentSchema.index({ sourceId: 1, chunkIndex: 1 }, { unique: true });
ragDocumentSchema.index({ hash: 1 });

export const RagDocument =
  (mongoose.models['RagDocument'] as mongoose.Model<IRagDocument>) ||
  model<IRagDocument>('RagDocument', ragDocumentSchema);
