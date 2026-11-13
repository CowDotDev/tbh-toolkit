import type { ResolvedHero, ResolvedRune, StatLine } from './types';

export interface StatDiffRow {
  key: string;
  label: string;
  mod: string;
  a?: StatLine;
  b?: StatLine;
  /** b - a in raw game units */
  delta: number;
}

/** Compares two stat-total lists (A = yours, B = theirs). */
export function diffStats(a: StatLine[], b: StatLine[]): StatDiffRow[] {
  const rows = new Map<string, StatDiffRow>();
  const key = (l: StatLine) => `${l.stat}|${l.mod}`;
  for (const l of a) rows.set(key(l), { key: key(l), label: l.label, mod: l.mod, a: l, delta: -l.value });
  for (const l of b) {
    const row = rows.get(key(l));
    if (row) {
      row.b = l;
      row.delta = l.value - (row.a?.value ?? 0);
    } else {
      rows.set(key(l), { key: key(l), label: l.label, mod: l.mod, b: l, delta: l.value });
    }
  }
  return [...rows.values()].sort((x, y) => x.label.localeCompare(y.label) || x.mod.localeCompare(y.mod));
}

export interface AttributeDiffRow {
  key: number;
  name: string;
  a: number;
  b: number;
  max: number;
}

export function diffAttributes(a: ResolvedHero | undefined, b: ResolvedHero | undefined): AttributeDiffRow[] {
  const rows = new Map<number, AttributeDiffRow>();
  for (const g of a?.attributeGroups ?? []) {
    for (const n of g.nodes) rows.set(n.key, { key: n.key, name: n.name, a: n.level, b: 0, max: n.max });
  }
  for (const g of b?.attributeGroups ?? []) {
    for (const n of g.nodes) {
      const row = rows.get(n.key);
      if (row) row.b = n.level;
      else rows.set(n.key, { key: n.key, name: n.name, a: 0, b: n.level, max: n.max });
    }
  }
  return [...rows.values()].filter((r) => r.a > 0 || r.b > 0).sort((x, y) => x.key - y.key);
}

export interface RuneDiffRow {
  key: number;
  name: string;
  a: number;
  b: number;
  max: number;
}

export function diffRunes(a: ResolvedRune[], b: ResolvedRune[]): RuneDiffRow[] {
  const rows = new Map<number, RuneDiffRow>();
  for (const r of a) rows.set(r.key, { key: r.key, name: r.name, a: r.level, b: 0, max: r.max });
  for (const r of b) {
    const row = rows.get(r.key);
    if (row) row.b = r.level;
    else rows.set(r.key, { key: r.key, name: r.name, a: 0, b: r.level, max: r.max });
  }
  return [...rows.values()].filter((r) => r.a !== r.b).sort((x, y) => x.key - y.key);
}
