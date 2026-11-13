/** Types shared by the main process, the renderer and tests. */

// ---------- game data (datamined from the local install) ----------

export interface Table {
  columns: string[];
  rows: string[][];
}

export interface GameData {
  /** Contents of the install's Version.txt, e.g. "1.3.2". */
  version: string;
  /** CSV tables keyed by TextAsset name, e.g. "ItemInfoData". */
  tables: Record<string, Table>;
  /** Localization key -> text for the active locale. */
  strings: Record<string, string>;
}

// ---------- raw save (subset of PlayerSaveData we read) ----------

export interface RawEnchant {
  StatModKey: number;
  Tier: number;
  Value: number;
  RecipeType: number;
  ModType: number;
  MaterialKey: number;
  StatType: number;
}

export interface RawRelicData {
  Value: number;
  StatModKey: number;
  StatTier: number;
  AttunementCount?: number;
  SlotColors?: number[];
  ResonanceParams?: { PartyModKey: number; Values: number[] }[];
  InherentStats?: { StatType: number; ModType: number; Value: number; MinValue?: number; MaxValue?: number }[];
}

export interface RawItem {
  ItemKey: number;
  UniqueId: string | number;
  IsChaotic?: boolean;
  EnchantData?: RawEnchant[] | null;
  RelicData?: RawRelicData | null;
}

export interface RawHero {
  heroKey: number;
  HeroLevel: number;
  IsUnLock: boolean;
  HeroExp: number;
  AbilityPoint: number;
  AllocatedHeroAbilityPoint: number;
  equippedItemIds: (string | number)[];
  equippedSKillKey: number[];
}

export interface RawSave {
  commonSaveData: {
    version: string;
    playTime?: number;
    ArrangedPetKey?: number;
    arrangedHeroKey?: number[];
    maxCompletedStage?: number;
    currentStageKey?: number;
  };
  heroSaveDatas: RawHero[];
  attributeSaveDatas: { Key: number; Level: number }[];
  itemSaveDatas: RawItem[];
  RuneSaveData?: { RuneKey: number; Level: number }[];
  PetSaveData?: { PetKey: number; IsUnlock: boolean }[];
  currenySaveDatas?: { Key: number; Quantity: number }[];
  relicEquipSaveData?: {
    ReliquarySlots?: { ReliquaryUid: string | number; RelicUids: (string | number)[] }[];
  } | null;
}

export interface SaveSnapshot {
  /** File the snapshot was read from (live save or a rolling backup). */
  file: string;
  mtimeMs: number;
  save: RawSave;
}

// ---------- share-code payload (compact, key-based, no personal identifiers) ----------

/** [statModKey, tier, value, recipeType, materialKey] */
export type EnchantTuple = [number, number, number, number, number];

export interface GearBuild {
  /** ItemKey */
  i: number;
  /** chaotic flag */
  c?: 1;
  e: EnchantTuple[];
}

export interface HeroBuild {
  /** heroKey */
  k: number;
  /** level */
  l: number;
  /** equipped skill keys */
  s: number[];
  /** [attributeKey, level] with level > 0 */
  a: [number, number][];
  /** gear by equipment slot index */
  g: (GearBuild | null)[];
}

export interface RelicBuild {
  i: number;
  /** statModKey, tier, value */
  m: number;
  t: number;
  v: number;
}

export interface ReliquaryBuild {
  i: number;
  /** inherent stats: [STATTYPE name (or numeric id when unknown), modType id, value] */
  st: [string | number, number, number][];
  /** resonance effects: [partyModKey, ...values] */
  rs: number[][];
  r: (RelicBuild | null)[];
}

export interface BuildSnapshot {
  v: 1;
  /** game version the build was captured on */
  game: string;
  /** unix seconds */
  at: number;
  label: string;
  /** arranged party hero keys */
  party: number[];
  heroes: HeroBuild[];
  /** [runeKey, level] with level > 0 */
  runes?: [number, number][];
  pet?: number;
  relics?: ReliquaryBuild[];
}

// ---------- resolved (display-ready) build ----------

export interface StatLine {
  stat: string;
  mod: string;
  value: number;
  label: string;
  text: string;
}

export interface ResolvedEnchant extends StatLine {
  kind: string;
  tier: number;
  min?: number;
  max?: number;
  material?: string;
}

export interface ResolvedGear {
  slot: number;
  part: string;
  itemKey: number;
  name: string;
  grade: string;
  gearType: string;
  level: number;
  chaotic: boolean;
  base: StatLine[];
  inherent: StatLine[];
  unique?: string;
  enchants: ResolvedEnchant[];
}

export interface ResolvedAttribute {
  key: number;
  name: string;
  type: string;
  level: number;
  max: number;
  effect?: string;
}

export interface ResolvedAttributeGroup {
  key: number;
  requiredPoints: number;
  nodes: ResolvedAttribute[];
}

export interface ResolvedHero {
  key: number;
  name: string;
  className: string;
  level: number;
  inParty: boolean;
  skills: { key: number; name: string }[];
  attributeGroups: ResolvedAttributeGroup[];
  pointsSpent: number;
  gear: (ResolvedGear | null)[];
  totals: StatLine[];
}

export interface ResolvedRune {
  key: number;
  name: string;
  level: number;
  max: number;
  effect: string;
}

export interface ResolvedRelic {
  itemKey: number;
  name: string;
  grade: string;
  color: string;
  stat?: StatLine;
  tier: number;
}

export interface ResolvedReliquary {
  itemKey: number;
  name: string;
  grade: string;
  stats: StatLine[];
  resonance: string[];
  relics: (ResolvedRelic | null)[];
}

export interface ResolvedBuild {
  label: string;
  game: string;
  at: number;
  heroes: ResolvedHero[];
  runes: ResolvedRune[];
  hasRunes: boolean;
  pet?: { key: number; name: string; stats: StatLine[] };
  relics: ResolvedReliquary[];
  hasRelics: boolean;
}

// ---------- app status ----------

export interface AppStatus {
  installDir: string | null;
  saveDir: string | null;
  gameVersion: string | null;
  tableCount: number;
  stringCount: number;
  saveFile: string | null;
  saveTime: number | null;
  saveVersion: string | null;
  errors: string[];
}
