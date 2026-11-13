import type { GameIndex, Row } from './game-index';
import type {
  BuildSnapshot,
  EnchantTuple,
  GearBuild,
  HeroBuild,
  RawItem,
  RawSave,
  ReliquaryBuild,
  ResolvedAttributeGroup,
  ResolvedBuild,
  ResolvedEnchant,
  ResolvedGear,
  ResolvedHero,
  ResolvedRelic,
  ResolvedReliquary,
  ResolvedRune,
  StatLine,
} from './types';

/** Numeric ModType ids used in the save. */
export const MOD_NAMES = ['FLAT', 'ADDITIVE', 'MULTIPLICATIVE'];

/** Display order for the equipment slots (ItemInfoData.PARTS). */
export const PART_ORDER = [
  'MAIN_WEAPON',
  'SUB_WEAPON',
  'HELMET',
  'ARMOR',
  'GLOVES',
  'BOOTS',
  'AMULET',
  'EARING',
  'RING',
  'BRACER',
];

const ENCHANT_KINDS: Record<string, string> = {
  DECORATION: 'Decoration',
  ENGRAVING: 'Engraving',
  INSCRIPTION: 'Inscription',
};
const RECIPE_KINDS: Record<number, string> = { 3: 'Decoration', 4: 'Engraving', 5: 'Inscription' };

const num = (v: string | number | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function humanize(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b([A-Z])([A-Z]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase())
    .trim();
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** The game's display name for a stat, falling back to its value template and then the raw id. */
export function statLabel(index: GameIndex, stat: string): string {
  const named = index.data.strings[`StatName_${stat}`];
  if (named) return named;
  const cleaned = index.data.strings[`Stat_${stat}_FLAT`]?.replace(/\{0\}%?|\+/g, '').trim();
  return cleaned || humanize(stat);
}

/**
 * Formats a stat using the game's own `Stat_<STATTYPE>_<MODTYPE>` template.
 * The game stores percentage stats in tenths of a percent, so templates that contain "%" are
 * shown as value / 10; everything else is shown raw.
 */
export function statLine(index: GameIndex, stat: string, mod: string, value: number): StatLine {
  const template = index.data.strings[`Stat_${stat}_${mod}`];
  const label = statLabel(index, stat);
  const percent = template ? template.includes('%') : mod !== 'FLAT';
  const shown = formatNumber(percent ? value / 10 : value);
  const text = template
    ? template.replace('{0}', shown)
    : `${label} ${mod === 'FLAT' ? '+' : ''}${shown}${percent ? '%' : ''}${mod === 'FLAT' ? '' : ` (${mod.toLowerCase()})`}`;
  return { stat, mod, value, label, text };
}

/** Sums stat lines by STATTYPE x MODTYPE. */
export function sumStats(index: GameIndex, lines: StatLine[]): StatLine[] {
  const totals = new Map<string, { stat: string; mod: string; value: number }>();
  for (const l of lines) {
    const key = `${l.stat}|${l.mod}`;
    const cur = totals.get(key);
    if (cur) cur.value += l.value;
    else totals.set(key, { stat: l.stat, mod: l.mod, value: l.value });
  }
  return [...totals.values()]
    .map((t) => statLine(index, t.stat, t.mod, t.value))
    .sort((a, b) => a.label.localeCompare(b.label) || a.mod.localeCompare(b.mod));
}

/**
 * The save only stores numeric StatType ids. We learn id -> STATTYPE name from enchants, which
 * carry both the numeric id and a StatModKey that the game tables can name.
 */
export function learnStatTypes(save: RawSave, index: GameIndex): Map<number, string> {
  const learned = new Map<number, string>();
  for (const item of save.itemSaveDatas) {
    for (const e of item.EnchantData ?? []) {
      if (!e.StatModKey || learned.has(e.StatType)) continue;
      const row = findStatMod(index, e.StatModKey, e.Tier);
      if (row) learned.set(e.StatType, row.STATTYPE);
    }
  }
  return learned;
}

function findStatMod(index: GameIndex, statModKey: number, tier: number): Row | undefined {
  const rows = index.group('StatModInfoData', 'StatModKey', statModKey);
  return rows.find((r) => num(r.Tier) === tier) ?? rows[0];
}

// ---------------------------------------------------------------------------------------------
// save -> BuildSnapshot
// ---------------------------------------------------------------------------------------------

export interface SnapshotOptions {
  /** Heroes to include; defaults to every unlocked hero. */
  heroKeys?: number[];
  runes?: boolean;
  pet?: boolean;
  relics?: boolean;
  label?: string;
  /** unix seconds; defaults to now */
  at?: number;
}

export function snapshotFromSave(save: RawSave, index: GameIndex, opts: SnapshotOptions = {}): BuildSnapshot {
  const items = new Map<string, RawItem>();
  for (const it of save.itemSaveDatas) items.set(String(it.UniqueId), it);
  const itemAt = (id: string | number | undefined): RawItem | undefined =>
    id === undefined || String(id) === '0' ? undefined : items.get(String(id));

  const unlocked = save.heroSaveDatas.filter((h) => h.IsUnLock);
  const wanted = opts.heroKeys ? unlocked.filter((h) => opts.heroKeys!.includes(h.heroKey)) : unlocked;
  const party = (save.commonSaveData.arrangedHeroKey ?? []).filter((k) => k > 0);

  const attrLevels = new Map<number, number>();
  for (const a of save.attributeSaveDatas) if (a.Level > 0) attrLevels.set(a.Key, a.Level);

  const heroes: HeroBuild[] = wanted.map((h) => {
    const attrRows = index.group('AttributeInfoData', 'HeroKey', h.heroKey);
    const attrKeys = attrRows.length
      ? attrRows.map((r) => num(r.AttributeKey))
      : [...attrLevels.keys()].filter((k) => Math.floor(k / 1000) === h.heroKey);
    const a: [number, number][] = [];
    for (const k of attrKeys) {
      const level = attrLevels.get(k);
      if (level) a.push([k, level]);
    }
    const g: (GearBuild | null)[] = h.equippedItemIds.map((id) => {
      const it = itemAt(id);
      return it ? gearFromItem(it) : null;
    });
    while (g.length && g[g.length - 1] === null) g.pop();
    return { k: h.heroKey, l: h.HeroLevel, s: h.equippedSKillKey.filter((s) => s > 0), a, g };
  });

  const snapshot: BuildSnapshot = {
    v: 1,
    game: index.version || save.commonSaveData.version,
    at: opts.at ?? Math.floor(Date.now() / 1000),
    label: (opts.label ?? '').slice(0, 80),
    party,
    heroes,
  };

  if (opts.runes !== false) {
    snapshot.runes = (save.RuneSaveData ?? []).filter((r) => r.Level > 0).map((r) => [r.RuneKey, r.Level]);
  }
  if (opts.pet !== false && save.commonSaveData.ArrangedPetKey) {
    snapshot.pet = save.commonSaveData.ArrangedPetKey;
  }
  if (opts.relics !== false) {
    const statNames = learnStatTypes(save, index);
    const slots = save.relicEquipSaveData?.ReliquarySlots ?? [];
    const relics: ReliquaryBuild[] = [];
    for (const slot of slots) {
      const reliquary = itemAt(slot.ReliquaryUid);
      if (!reliquary) continue;
      const rd = reliquary.RelicData;
      relics.push({
        i: reliquary.ItemKey,
        st: (rd?.InherentStats ?? []).map((s) => [statNames.get(s.StatType) ?? guessPoolStat(index, reliquary.ItemKey, s, statNames) ?? s.StatType, s.ModType, s.Value]),
        rs: (rd?.ResonanceParams ?? []).map((p) => [p.PartyModKey, ...p.Values.map((v) => Math.round(v * 10000) / 10000)]),
        r: slot.RelicUids.map((uid) => {
          const relic = itemAt(uid);
          const d = relic?.RelicData;
          return relic ? { i: relic.ItemKey, m: d?.StatModKey ?? 0, t: d?.StatTier ?? 0, v: d?.Value ?? 0 } : null;
        }),
      });
    }
    snapshot.relics = relics;
  }
  return snapshot;
}

/**
 * Reliquary inherent stats only carry a numeric StatType. When we have not learned its name from
 * an enchant, match it against the reliquary's stat pool by mod type and roll range.
 */
function guessPoolStat(
  index: GameIndex,
  itemKey: number,
  stat: { StatType: number; ModType: number; Value: number; MinValue?: number; MaxValue?: number },
  known: Map<number, string>,
): string | undefined {
  const poolKey = index.find('ReliquaryInfoData', 'ItemKey', itemKey)?.InherentPoolKey;
  if (!poolKey) return undefined;
  const taken = new Set(known.values());
  const mod = MOD_NAMES[stat.ModType];
  const candidates = index
    .group('StatPoolInfoData', 'StatPoolKey', poolKey)
    .filter((r) => r.MODTYPE === mod && !taken.has(r.STATTYPE))
    .filter((r) =>
      stat.MinValue !== undefined && stat.MaxValue !== undefined
        ? num(r.MinValue) === stat.MinValue && num(r.MaxValue) === stat.MaxValue
        : num(r.MinValue) <= stat.Value && stat.Value <= num(r.MaxValue),
    );
  const names = [...new Set(candidates.map((r) => r.STATTYPE))];
  return names.length === 1 ? names[0] : undefined;
}

function gearFromItem(item: RawItem): GearBuild {
  const e: EnchantTuple[] = [];
  for (const x of item.EnchantData ?? []) {
    if (x.StatModKey) e.push([x.StatModKey, x.Tier, x.Value, x.RecipeType, x.MaterialKey]);
  }
  const gear: GearBuild = { i: item.ItemKey, e };
  if (item.IsChaotic) gear.c = 1;
  return gear;
}

// ---------------------------------------------------------------------------------------------
// BuildSnapshot -> ResolvedBuild (names, formatted stats, totals)
// ---------------------------------------------------------------------------------------------

export function resolveBuild(build: BuildSnapshot, index: GameIndex): ResolvedBuild {
  const heroes = build.heroes.map((h) => resolveHero(h, build.party, index));
  heroes.sort((a, b) => Number(b.inParty) - Number(a.inParty) || partyRank(build.party, a.key) - partyRank(build.party, b.key) || a.key - b.key);

  const resolved: ResolvedBuild = {
    label: build.label,
    game: build.game,
    at: build.at,
    heroes,
    runes: (build.runes ?? []).map(([key, level]) => resolveRune(key, level, index)),
    hasRunes: build.runes !== undefined,
    relics: (build.relics ?? []).map((r) => resolveReliquary(r, index)),
    hasRelics: build.relics !== undefined,
  };

  if (build.pet) {
    const row = index.find('PetInfoData', 'PetKey', build.pet);
    resolved.pet = {
      key: build.pet,
      name: index.t(row?.NameKey ?? `PetName_${build.pet}`, `Pet ${build.pet}`),
      stats: row
        ? index.group('PetStatInfoData', 'PetStatKey', row.StatDataKey).map((s) => statLine(index, s.STATTYPE, s.MODTYPE, num(s.Value)))
        : [],
    };
  }
  return resolved;
}

const partyRank = (party: number[], key: number): number => {
  const i = party.indexOf(key);
  return i < 0 ? 99 : i;
};

function resolveHero(h: HeroBuild, party: number[], index: GameIndex): ResolvedHero {
  const row = index.find('HeroInfoData', 'HeroKey', h.k);
  const gear = h.g.map((g, slot) => (g ? resolveGear(g, slot, index) : null));

  const lines: StatLine[] = [];
  for (const g of gear) if (g) lines.push(...g.base, ...g.inherent, ...g.enchants);

  const levels = new Map(h.a);
  const groups = new Map<number, ResolvedAttributeGroup>();
  let pointsSpent = 0;
  for (const a of index.group('AttributeInfoData', 'HeroKey', h.k)) {
    const key = num(a.AttributeKey);
    const groupKey = num(a.GroupKey);
    let group = groups.get(groupKey);
    if (!group) {
      const g = index.find('AttributeGroupInfoData', 'AttributeGroupKey', groupKey);
      group = { key: groupKey, requiredPoints: num(g?.RequiredAllocatedPoint), nodes: [] };
      groups.set(groupKey, group);
    }
    const level = levels.get(key) ?? 0;
    pointsSpent += level * (num(a.RequiredPoint) || 1);
    let name = `Attribute ${key}`;
    let effect: string | undefined;
    if (a.ATTRIBUTETYPE === 'PASSIVESKILL') {
      const p = index.find('PassiveSkillInfoData', 'PassiveSkillKey', a.Value);
      if (p) {
        name = index.t(p.SkillNameKey, humanize(p.SkillNameKey.replace(/^Passive_/, '')));
        if (p.STATTYPE && p.STATTYPE !== 'NONE' && level > 0) {
          effect = statLine(index, p.STATTYPE, p.MODTYPE, num(p.Value) * level).text;
        }
      }
    } else {
      const s = index.find('SkillInfoData', 'SkillKey', a.Value);
      name = index.t(s?.SkillNameKey ?? `SkillName_${a.Value}`, `Skill ${a.Value}`);
    }
    group.nodes.push({ key, name, type: a.ATTRIBUTETYPE, level, max: num(a.MaxLevel), effect });
  }
  // Attributes present in the code but unknown to this install's tables (version mismatch).
  if (groups.size === 0 && h.a.length) {
    groups.set(0, {
      key: 0,
      requiredPoints: 0,
      nodes: h.a.map(([key, level]) => ({ key, name: `Attribute ${key}`, type: 'UNKNOWN', level, max: level })),
    });
    pointsSpent = h.a.reduce((s, [, level]) => s + level, 0);
  }

  return {
    key: h.k,
    name: index.t(row?.HeroNameKey ?? `HeroName_${h.k}`, `Hero ${h.k}`),
    className: row?.ClassType ?? '',
    level: h.l,
    inParty: party.includes(h.k),
    skills: h.s.map((key) => {
      const s = index.find('SkillInfoData', 'SkillKey', key);
      return { key, name: index.t(s?.SkillNameKey ?? `SkillName_${key}`, `Skill ${key}`) };
    }),
    attributeGroups: [...groups.values()].sort((a, b) => a.key - b.key),
    pointsSpent,
    gear,
    totals: sumStats(index, lines),
  };
}

function resolveGear(g: GearBuild, slot: number, index: GameIndex): ResolvedGear {
  const item = index.find('ItemInfoData', 'ItemKey', g.i);
  const gearRow = item?.GearKey ? index.find('GearInfoData', 'GearKey', item.GearKey) : undefined;
  const typeRow = item?.GEARTYPE ? index.find('GearTypeInfoData', 'GearType', item.GEARTYPE) : undefined;

  const base: StatLine[] = [];
  const inherent: StatLine[] = [];
  let unique: string | undefined;
  if (gearRow) {
    for (const n of [1, 2]) {
      const stat = typeRow?.[`BaseStat${n}_STATTYPE`];
      const value = num(gearRow[`BaseStat${n}_Value`]);
      if (stat && stat !== 'NONE' && value) base.push(statLine(index, stat, typeRow![`BaseStat${n}_MODTYPE`] || 'FLAT', value));
    }
    for (const n of [1, 2, 3]) {
      const stat = gearRow[`InherentStat${n}_STATTYPE`];
      const value = num(gearRow[`InherentStat${n}_Value`]);
      if (stat && stat !== 'NONE' && value) inherent.push(statLine(index, stat, gearRow[`InherentStat${n}_MODTYPE`] || 'FLAT', value));
    }
    if (gearRow.UniqueModKey) unique = uniqueModText(index, gearRow.UniqueModKey);
  }

  const enchants: ResolvedEnchant[] = g.e.map(([statModKey, tier, value, recipeType, materialKey]) => {
    const mod = findStatMod(index, statModKey, tier);
    const material = materialKey ? index.find('MaterialInfoData', 'ItemKey', materialKey) : undefined;
    const materialItem = materialKey ? index.find('ItemInfoData', 'ItemKey', materialKey) : undefined;
    const line = mod
      ? statLine(index, mod.STATTYPE, mod.MODTYPE, value)
      : { stat: `StatMod${statModKey}`, mod: 'FLAT', value, label: `Stat mod ${statModKey}`, text: `Stat mod ${statModKey} +${value}` };
    const exact = mod && num(mod.Tier) === tier ? mod : undefined;
    return {
      ...line,
      kind: ENCHANT_KINDS[material?.MATERIALTYPE ?? ''] ?? RECIPE_KINDS[recipeType] ?? 'Enchant',
      tier,
      min: exact ? num(exact.MinValue) : undefined,
      max: exact ? num(exact.MaxValue) : undefined,
      material: materialItem ? index.t(materialItem.NameKey) : undefined,
    };
  });

  return {
    slot,
    part: item?.PARTS || `SLOT_${slot}`,
    itemKey: g.i,
    name: item ? index.t(item.NameKey) : `Item ${g.i}`,
    grade: item?.GRADE ?? '',
    gearType: item?.GEARTYPE ?? '',
    level: num(item?.Level),
    chaotic: g.c === 1,
    base,
    inherent,
    unique,
    enchants,
  };
}

/** Best-effort rendering of a unique mod description with its table parameters. */
function uniqueModText(index: GameIndex, uniqueModKey: string | number, values?: number[]): string | undefined {
  const row = index.find('UniqueModInfoData', 'UniqueModKey', uniqueModKey);
  if (!row) return undefined;
  const template = index.data.strings[`UniqueMod_${row.UniqueMod}`];
  if (!template) return humanize(row.UniqueMod);
  return fillTemplate(index, template, (n) => {
    if (values && values[n] !== undefined) return { value: values[n], scaled: true };
    const raw = row[`Param${n + 1}`];
    if (raw === undefined || raw === '') return undefined;
    const ex = row[`Param${n + 1}ExchangeType`];
    return { value: num(raw), divide1000: ex === 'Raw_Divide1000', scaled: false };
  });
}

interface TemplateParam {
  value: number;
  divide1000?: boolean;
  /** true when the value is already a 0..1 fraction (resonance values from the save) */
  scaled: boolean;
}

function fillTemplate(index: GameIndex, template: string, param: (n: number) => TemplateParam | undefined): string {
  return template.replace(/\{(\d)\}(%?)/g, (whole, d: string, pct: string) => {
    const p = param(Number(d));
    if (!p) return whole;
    const skill = index.data.strings[`SkillName_${p.value}`];
    if (skill && !pct) return skill;
    let v = p.value;
    if (p.scaled) v = pct && Math.abs(v) <= 1 ? v * 100 : v;
    else if (p.divide1000) v = pct ? v / 10 : v / 1000;
    return formatNumber(v) + pct;
  });
}

function resolveRune(key: number, level: number, index: GameIndex): ResolvedRune {
  const row = index.find('RuneInfoData', 'RuneKey', key);
  const levelRows = row ? index.group('RuneLevelInfoData', 'LevelKey', row.LevelDataKey) : [];
  const upTo = levelRows.filter((r) => num(r.Level) <= level);
  const stat = upTo[0]?.STATTYPE;
  const total = upTo.reduce((s, r) => s + num(r.Value), 0);
  return {
    key,
    name: index.t(row?.NameKey ?? '', `Rune ${key}`),
    level,
    max: num(row?.MaxLevel) || level,
    effect: stat ? `${humanize(stat)} ${formatNumber(total)}` : '',
  };
}

function resolveReliquary(r: ReliquaryBuild, index: GameIndex): ResolvedReliquary {
  const item = index.find('ItemInfoData', 'ItemKey', r.i);
  return {
    itemKey: r.i,
    name: item ? index.t(item.NameKey) : `Reliquary ${r.i}`,
    grade: item?.GRADE ?? '',
    stats: r.st.map(([stat, mod, value]) =>
      typeof stat === 'string'
        ? statLine(index, stat, MOD_NAMES[mod] ?? 'FLAT', value)
        : { stat: `Stat${stat}`, mod: MOD_NAMES[mod] ?? 'FLAT', value, label: `Stat #${stat}`, text: `Stat #${stat} +${formatNumber(value)}` },
    ),
    resonance: r.rs.map(([partyModKey, ...values]) => {
      const row = index.find('PartyModInfoData', 'PartyModKey', partyModKey);
      if (!row) return `Resonance ${partyModKey}`;
      if (row.PartyMod && row.PartyMod !== 'None') {
        const template = index.data.strings[`PartyMod_${row.PartyMod}`];
        return template
          ? fillTemplate(index, template, (n) => (values[n] === undefined ? undefined : { value: values[n], scaled: true }))
          : humanize(row.PartyMod);
      }
      return uniqueModText(index, row.Param1) ?? `Resonance ${partyModKey}`;
    }),
    relics: r.r.map((relic): ResolvedRelic | null => {
      if (!relic) return null;
      const ri = index.find('ItemInfoData', 'ItemKey', relic.i);
      const mod = relic.m ? findStatMod(index, relic.m, relic.t) : undefined;
      return {
        itemKey: relic.i,
        name: ri ? index.t(ri.NameKey) : `Relic ${relic.i}`,
        grade: ri?.GRADE ?? '',
        color: (ri?.GEARTYPE ?? '').replace('RELIC_', ''),
        stat: mod ? statLine(index, mod.STATTYPE, mod.MODTYPE, relic.v) : undefined,
        tier: relic.t,
      };
    }),
  };
}
