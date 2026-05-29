import type {
  HintPhilosophy,
  SpoilerTolerance,
} from "@secondseat/db";

/**
 * Hardcoded fallbacks used when a player's Profile or Preferences record is
 * not yet in Mongo (per SPEC-profile-aware-prompt, Story 1).
 *
 * When the Profile/Preferences onboarding frontend ships, the seed path for
 * new records should source the same constants from this module so the
 * defaults applied in inference and at user creation cannot drift.
 *
 * Only the fields actually consumed by the prompt assembler are typed here;
 * the full IProfile / IPreferences shapes are intentionally not mirrored
 * (we don't need _id, userId, timestamps, etc. at the prompt layer).
 */

export interface DefaultProfileShape {
  hintPhilosophy: HintPhilosophy;
  spoilerTolerance: SpoilerTolerance;
}

export interface DefaultPreferencesShape {
  maxHintLines: number;
}

export const DEFAULT_PROFILE: DefaultProfileShape = {
  hintPhilosophy: "directional",
  spoilerTolerance: "low",
};

export const DEFAULT_PREFERENCES: DefaultPreferencesShape = {
  maxHintLines: 3,
};
