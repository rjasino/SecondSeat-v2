import argon2 from 'argon2';
import mongoose from 'mongoose';
import { connect, User } from '../src/index.js';

// ─── Env validation ───────────────────────────────────────────────────────────

const MONGODB_URI = process.env['MONGODB_URI'];
const SEED_ADMIN_NAME = process.env['SEED_ADMIN_NAME'];
const SEED_ADMIN_EMAIL = process.env['SEED_ADMIN_EMAIL'];
const SEED_ADMIN_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];
const SEED_AUTHOR_NAME = process.env['SEED_AUTHOR_NAME'];
const SEED_AUTHOR_EMAIL = process.env['SEED_AUTHOR_EMAIL'];
const SEED_AUTHOR_PASSWORD = process.env['SEED_AUTHOR_PASSWORD'];

const missing = [
  ['MONGODB_URI', MONGODB_URI],
  ['SEED_ADMIN_NAME', SEED_ADMIN_NAME],
  ['SEED_ADMIN_EMAIL', SEED_ADMIN_EMAIL],
  ['SEED_ADMIN_PASSWORD', SEED_ADMIN_PASSWORD],
  ['SEED_AUTHOR_NAME', SEED_AUTHOR_NAME],
  ['SEED_AUTHOR_EMAIL', SEED_AUTHOR_EMAIL],
  ['SEED_AUTHOR_PASSWORD', SEED_AUTHOR_PASSWORD],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// Validate password lengths before touching the database
const shortPasswords = [
  ['SEED_ADMIN_PASSWORD', SEED_ADMIN_PASSWORD!],
  ['SEED_AUTHOR_PASSWORD', SEED_AUTHOR_PASSWORD!],
].filter(([, p]) => p.length < 12);

if (shortPasswords.length > 0) {
  console.error(
    `Passwords must be at least 12 characters. Too short: ${shortPasswords.map(([k]) => k).join(', ')}`,
  );
  process.exit(1);
}

// ─── Seed logic ───────────────────────────────────────────────────────────────

interface SeedAccount {
  email: string;
  password: string;
  role: 'admin' | 'author';
  name: string;
}

async function seedAccount({ email, password, role, name }: SeedAccount) {
  const normalized = email.toLowerCase();
  const existing = await User.findOne({ email: normalized });

  if (existing) {
    console.log(`[${role}] ${normalized} — already exists, skipping.`);
    return;
  }

  const passwordHash = await argon2.hash(password);
  await User.create({
    name,
    email: normalized,
    passwordHash,
    role,
    profile: { displayName: name },
  });

  console.log(`[${role}] ${normalized} — created.`);
}

async function main() {
  await connect(MONGODB_URI!);

  await seedAccount({
    email: SEED_ADMIN_EMAIL!,
    password: SEED_ADMIN_PASSWORD!,
    role: 'admin',
    name: SEED_ADMIN_NAME!,
  });

  await seedAccount({
    email: SEED_AUTHOR_EMAIL!,
    password: SEED_AUTHOR_PASSWORD!,
    role: 'author',
    name: SEED_AUTHOR_NAME!,
  });

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
