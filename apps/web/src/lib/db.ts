import { connect } from '@secondseat/db';
import { loadConfig } from './config';

/**
 * Ensure a Mongoose connection is open before running a DB operation.
 * Safe to call on every request — the underlying connect() is idempotent.
 */
export async function ensureDb(): Promise<void> {
  const config = loadConfig();
  await connect(config.MONGODB_URI);
}
