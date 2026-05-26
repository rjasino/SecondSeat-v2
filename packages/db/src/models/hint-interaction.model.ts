import mongoose, { type Document, type Types, Schema, model } from 'mongoose';

export interface IHintRequest {
  rawInput: string;
  detectedIntent: 'progression' | 'confirmation' | 'exploration' | 'completion';
  createdAt: Date;
}

export interface IHintResponse {
  outputText: string;
  lineCount: number;
  refused: boolean;
  refusalReason?: string;
  audioUri?: string;
  createdAt: Date;
}

export interface IHintInteraction extends Document {
  playSessionId: Types.ObjectId;
  request: IHintRequest;
  response: IHintResponse;
  createdAt: Date;
  updatedAt: Date;
}

const hintRequestSchema = new Schema<IHintRequest>(
  {
    rawInput: { type: String, required: true },
    detectedIntent: {
      type: String,
      enum: ['progression', 'confirmation', 'exploration', 'completion'],
      required: true,
    },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const hintResponseSchema = new Schema<IHintResponse>(
  {
    outputText: { type: String, required: true },
    lineCount: { type: Number, required: true },
    refused: { type: Boolean, required: true, default: false },
    refusalReason: { type: String },
    audioUri: { type: String },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const hintInteractionSchema = new Schema<IHintInteraction>(
  {
    playSessionId: { type: Schema.Types.ObjectId, ref: 'PlaySession', required: true },
    request: { type: hintRequestSchema, required: true },
    response: { type: hintResponseSchema, required: true },
  },
  { timestamps: true },
);

hintInteractionSchema.index({ playSessionId: 1, createdAt: -1 });

export const HintInteraction =
  (mongoose.models['HintInteraction'] as mongoose.Model<IHintInteraction>) ||
  model<IHintInteraction>('HintInteraction', hintInteractionSchema);
