/** Request/response shapes exchanged between tool main modules and their renderer UIs. */

// ---------- build-share ----------

export interface LibraryEntry {
  id: string;
  addedAt: number;
  label: string;
  game: string;
  at: number;
  heroes: { key: number; name: string; level: number }[];
}

export interface ExportOptions {
  heroKeys: number[];
  runes: boolean;
  pet: boolean;
  relics: boolean;
  label: string;
}

// ---------- data-browser ----------

export interface TableSummary {
  name: string;
  columns: number;
  rows: number;
}

// ---------- live-rates ----------

export interface HeroRate {
  key: number;
  name: string;
  level: number;
  exp: number;
  /** exp gained during the session */
  gained: number;
  xpPerHour: number;
  /** exp still needed for the next level; undefined at max level */
  toNextLevel?: number;
  etaSeconds?: number;
}

export interface RatesState {
  startedAt: number | null;
  lastSampleAt: number | null;
  samples: number;
  gold: number;
  goldEarned: number;
  goldPerHour: number;
  xpPerHour: number;
  heroes: HeroRate[];
  history: SessionSummary[];
}

export interface SessionSummary {
  startedAt: number;
  endedAt: number;
  goldEarned: number;
  xpGained: number;
}
