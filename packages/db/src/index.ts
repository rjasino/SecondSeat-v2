import mongoose from 'mongoose';

// ─── Connection ───────────────────────────────────────────────────────────────

let _connectionPromise: Promise<typeof mongoose> | null = null;

/**
 * Connect to MongoDB. Safe to call repeatedly — returns immediately if already
 * connected, deduplicates concurrent calls via a module-level promise.
 */
export async function connect(uri: string): Promise<void> {
  if (mongoose.connection.readyState >= 1) return;
  if (!_connectionPromise) {
    _connectionPromise = mongoose.connect(uri, { bufferCommands: false });
    _connectionPromise.catch(() => {
      // reset so the next call retries
      _connectionPromise = null;
    });
  }
  await _connectionPromise;
}

export function getState() {
  return mongoose.connection.readyState;
}

// ─── Models ───────────────────────────────────────────────────────────────────

export { User } from './models/user.model.js';
export { Game } from './models/game.model.js';
export { PlaySession } from './models/play-session.model.js';
export { HintInteraction } from './models/hint-interaction.model.js';
export { RagSource } from './models/rag-source.model.js';
export { RagIngestionJob } from './models/rag-ingestion-job.model.js';
export { RagDocument } from './models/rag-document.model.js';

// ─── Type re-exports ──────────────────────────────────────────────────────────

export type { IUser, IUserProfile } from './models/user.model.js';
export type { IGame } from './models/game.model.js';
export type { IPlaySession, ICurrentContext, IContextEvent } from './models/play-session.model.js';
export type { IHintInteraction, IHintRequest, IHintResponse } from './models/hint-interaction.model.js';
export type {
  IRagSource,
  ISourceMetadata,
  SourceType,
  SourceStatus,
  SpoilerLevel,
} from './models/rag-source.model.js';
export type { IRagIngestionJob, JobStatus } from './models/rag-ingestion-job.model.js';
export type { IRagDocument } from './models/rag-document.model.js';
