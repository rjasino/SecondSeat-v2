import mongoose from "mongoose";
import { workerConfig } from "../config/worker.config.js";

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected) return;
  await mongoose.connect(workerConfig.MONGO_URL);
  connected = true;
}
