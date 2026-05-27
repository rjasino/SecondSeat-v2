import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: "user" | "author" | "admin";
  emailVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "author", "admin"],
      default: "user",
      required: true,
    },
    emailVerifiedAt: { type: Date },
  },
  { timestamps: true }
);

export const UserModel: Model<IUser> =
  (mongoose.models["User"] as Model<IUser>) ??
  mongoose.model<IUser>("User", userSchema);
