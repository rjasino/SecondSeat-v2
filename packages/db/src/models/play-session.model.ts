import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export interface IPlaySession extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  gameId: Types.ObjectId;
  startedAt: Date;
  endedAt?: Date;
  isActive: boolean;
  memoryClearedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const playSessionSchema = new Schema<IPlaySession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    gameId: { type: Schema.Types.ObjectId, ref: "Game", required: true },
    startedAt: { type: Date, required: true, default: () => new Date() },
    endedAt: { type: Date },
    isActive: { type: Boolean, default: true, required: true },
    memoryClearedAt: { type: Date },
  },
  { timestamps: true }
);

export const PlaySessionModel: Model<IPlaySession> =
  (mongoose.models["PlaySession"] as Model<IPlaySession>) ??
  mongoose.model<IPlaySession>("PlaySession", playSessionSchema);
