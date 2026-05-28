/**
 * Seed privileged users (admin and/or author) plus game data into MongoDB.
 * Run with: npm run seed -w @secondseat/web
 *
 * Required env var: MONGO_URL
 *
 * Admin user (at least one role group required):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 *   SEED_ADMIN_NAME  (optional — defaults to "Admin")
 *
 * Author user (at least one role group required):
 *   SEED_AUTHOR_EMAIL, SEED_AUTHOR_PASSWORD
 *   SEED_AUTHOR_NAME  (optional — defaults to "Author")
 *
 * The script is idempotent: if a user with the given email already exists
 * it is skipped rather than duplicated or overwritten.
 */
import argon2 from "argon2";
import { connectDB, GameModel, UserModel } from "@secondseat/db";
import games from "./game.json";

interface SeedConfig {
  role: "admin" | "author";
  email: string;
  password: string;
  name: string;
}

async function seedUser(cfg: SeedConfig): Promise<void> {
  const existing = await UserModel.findOne({ email: cfg.email.toLowerCase() });
  if (existing) {
    console.log(`[${cfg.role}] already exists: ${cfg.email} — skipping`);
    return;
  }

  const hash = await argon2.hash(cfg.password);
  await UserModel.create({
    name: cfg.name,
    email: cfg.email.toLowerCase(),
    password: hash,
    role: cfg.role,
  });

  console.log(`[${cfg.role}] created: ${cfg.email}`);
}

async function seedGames(): Promise<void> {
  for (const game of games) {
    await GameModel.create({
      title: game.title,
      slug: game.slug,
      developer: game.developer,
      releaseYear: game.releaseYear,
      genre: game.genre,
      supported: game.supported,
    });
    console.log(`Game created: ${game.title}`);
  }
}

async function main(): Promise<void> {
  const MONGO_URL = process.env["MONGO_URL"];
  if (!MONGO_URL) throw new Error("MONGO_URL is required");

  const adminEmail = process.env["SEED_ADMIN_EMAIL"];
  const adminPassword = process.env["SEED_ADMIN_PASSWORD"];
  const adminName = process.env["SEED_ADMIN_NAME"] ?? "Admin";

  const authorEmail = process.env["SEED_AUTHOR_EMAIL"];
  const authorPassword = process.env["SEED_AUTHOR_PASSWORD"];
  const authorName = process.env["SEED_AUTHOR_NAME"] ?? "Author";

  const toSeed: SeedConfig[] = [];

  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12)
      throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
    toSeed.push({
      role: "admin",
      email: adminEmail,
      password: adminPassword,
      name: adminName,
    });
  }

  if (authorEmail && authorPassword) {
    if (authorPassword.length < 12)
      throw new Error("SEED_AUTHOR_PASSWORD must be at least 12 characters");
    toSeed.push({
      role: "author",
      email: authorEmail,
      password: authorPassword,
      name: authorName,
    });
  }

  if (toSeed.length === 0) {
    throw new Error(
      "No privileged users to seed. Provide at least one of:\n" +
        "  SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD\n" +
        "  SEED_AUTHOR_EMAIL + SEED_AUTHOR_PASSWORD",
    );
  }

  const db = await connectDB();

  for (const cfg of toSeed) {
    await seedUser(cfg);
  }

  await seedGames();

  await db.disconnect();
}

main().catch((err: Error) => {
  console.error("seed-privileged-users failed:", err.message);
  process.exit(1);
});
