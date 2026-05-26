import mongoose, { type Document, Schema, model } from "mongoose";

export interface IGame extends Document {
  title: string;
  slug: string;
  developer: string;
  releaseYear: number;
  genre: string;
  supported: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const gameSchema = new Schema<IGame>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true },
    developer: { type: String, required: true },
    releaseYear: { type: Number, required: true },
    genre: { type: String, required: true },
    supported: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

gameSchema.index({ slug: 1 }, { unique: true });

export const Game =
  (mongoose.models["Game"] as mongoose.Model<IGame>) ||
  model<IGame>("Game", gameSchema);
