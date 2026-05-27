/**
 * Hardcoded spoiler keyword list for MVP.
 *
 * Future path: load from MongoDB so authors can extend without a deploy.
 * Each entry is matched case-insensitively against the player's raw query.
 *
 * RE2R-focused for the MVP demo game. Extend per game before launch.
 */
export const SPOILER_KEYWORDS: readonly string[] = [
  // RE2R — story beats / endings
  "true ending",
  "secret ending",
  "4th survivor",
  "hunk",
  "tofu",
  "ada dies",
  "leon dies",
  "claire dies",
  "sherry",
  "annette dies",
  "william birkin last form",
  "final boss",
  "rocket launcher",
  "extra content",
  // Generic spoiler signals
  "ending",
  "end of game",
  "after credits",
  "post game",
  "what happens after",
  "true villain",
  "who is the traitor",
  "secret boss",
];
