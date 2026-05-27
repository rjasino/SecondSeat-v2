import mongoose from "mongoose";
import { config } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache:
    | { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
    | undefined;
}

if (!global.__mongooseCache) {
  global.__mongooseCache = { conn: null, promise: null };
}

export async function connectDB(): Promise<typeof mongoose> {
  const cache = global.__mongooseCache!;

  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(config.MONGO_URL);
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
