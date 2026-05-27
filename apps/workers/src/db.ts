import mongoose from "mongoose";
import { config } from "./config.js";

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected) return;
  await mongoose.connect(config.MONGO_URL);
  connected = true;
}
