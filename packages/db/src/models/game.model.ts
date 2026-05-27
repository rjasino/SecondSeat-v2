import mongoose, {
  type Document,
  type Model,
  Schema,
  type Types,
} from "mongoose";

export interface IGame extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  developer?: string;
  releaseYear?: number;
  genre?: string;
  supported: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const gameSchema = new Schema<IGame>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    developer: { type: String },
    releaseYear: { type: Number },
    genre: { type: String },
    supported: { type: Boolean, default: true, required: true },
  },
  { timestamps: true }
);

export const GameModel: Model<IGame> =
  (mongoose.models["Game"] as Model<IGame>) ??
  mongoose.model<IGame>("Game", gameSchema);
