export interface SeededGame {
  slug: string;
  label: string;
}

export const SEEDED_GAMES: SeededGame[] = [
  { slug: "re2r", label: "Resident Evil 2 Remake" },
  { slug: "elden_ring", label: "Elden Ring" },
  { slug: "valheim", label: "Valheim" },
];
