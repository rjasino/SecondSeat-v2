import mongoose, { type Document, type Types, Schema, model } from 'mongoose';

export interface IContextEvent {
  eventType: 'area_change' | 'chapter_update' | 'goal_change' | 'confidence_shift';
  previousValue: string;
  newValue: string;
  createdAt: Date;
}

export interface ICurrentContext {
  gameArea: string;
  chapter: string;
  subArea: string;
  playerGoal: 'progression' | 'exploration' | 'confirmation' | 'completion';
  confidenceLevel: 'confident' | 'uncertain' | 'stuck';
  updatedAt: Date;
}

export interface IPlaySession extends Document {
  userId: Types.ObjectId;
  gameId: Types.ObjectId;
  startedAt: Date;
  endedAt?: Date;
  isActive: boolean;
  memoryClearedAt?: Date;
  currentContext?: ICurrentContext;
  contextEvents: IContextEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const contextEventSchema = new Schema<IContextEvent>(
  {
    eventType: {
      type: String,
      enum: ['area_change', 'chapter_update', 'goal_change', 'confidence_shift'],
      required: true,
    },
    previousValue: { type: String, required: true },
    newValue: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const currentContextSchema = new Schema<ICurrentContext>(
  {
    gameArea: { type: String, default: '' },
    chapter: { type: String, default: '' },
    subArea: { type: String, default: '' },
    playerGoal: {
      type: String,
      enum: ['progression', 'exploration', 'confirmation', 'completion'],
      default: 'progression',
    },
    confidenceLevel: {
      type: String,
      enum: ['confident', 'uncertain', 'stuck'],
      default: 'uncertain',
    },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const playSessionSchema = new Schema<IPlaySession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
    startedAt: { type: Date, required: true, default: () => new Date() },
    endedAt: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
    memoryClearedAt: { type: Date },
    currentContext: { type: currentContextSchema },
    contextEvents: { type: [contextEventSchema], default: [] },
  },
  { timestamps: true },
);

playSessionSchema.index({ userId: 1, gameId: 1, isActive: 1 });
playSessionSchema.index({ 'currentContext.gameArea': 1, 'currentContext.chapter': 1 });

export const PlaySession =
  (mongoose.models['PlaySession'] as mongoose.Model<IPlaySession>) ||
  model<IPlaySession>('PlaySession', playSessionSchema);
