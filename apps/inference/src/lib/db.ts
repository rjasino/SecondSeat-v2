import mongoose from "mongoose";
import { inferenceConfig } from "../config/config.js";

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected) return;
  await mongoose.connect(inferenceConfig.MONGODB_URI);
  connected = true;
  console.log("[inference] MongoDB connected");
}
