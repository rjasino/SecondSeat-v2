/**
 * One-time migration: drop the unique compound index { metadata.game, metadata.author }
 * from the rag_sources collection. Run once against the live database after deploying
 * the updated rag-source.model.ts that no longer defines this index.
 *
 * Usage:
 *   npx tsx packages/db/src/migrations/drop-rag-source-author-unique-index.ts
 */

import mongoose from "mongoose";
import { fileURLToPath } from "url";

export const INDEX_NAME = "metadata.game_1_metadata.author_1";

export interface MigrationDeps {
  indexes: () => Promise<mongoose.mongo.Document[]>;
  dropIndex: (name: string) => Promise<void>;
  log: (msg: string) => void;
}

export async function dropRagSourceAuthorUniqueIndex(
  deps: MigrationDeps
): Promise<void> {
  const indexes = await deps.indexes();
  const exists = indexes.some((idx) => idx["name"] === INDEX_NAME);

  if (!exists) {
    deps.log(`Index "${INDEX_NAME}" not found — nothing to drop.`);
    return;
  }

  await deps.dropIndex(INDEX_NAME);
  deps.log(`Index "${INDEX_NAME}" dropped successfully.`);
}

async function main(): Promise<void> {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("MONGODB_URI env var is required");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error("No database connection");

  const collection = db.collection("ragsources");
  await dropRagSourceAuthorUniqueIndex({
    indexes: () => collection.indexes(),
    dropIndex: (name) => collection.dropIndex(name).then(() => undefined),
    log: console.log,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    })
    .finally(() => mongoose.disconnect());
}
