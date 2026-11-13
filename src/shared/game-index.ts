import type { GameData } from './types';

export type Row = Record<string, string>;

/** Lazy lookup helpers over the datamined tables and localization strings. */
export class GameIndex {
  private rowCache = new Map<string, Row[]>();
  private byCache = new Map<string, Map<string, Row>>();
  private groupCache = new Map<string, Map<string, Row[]>>();

  constructor(public readonly data: GameData) {}

  get version(): string {
    return this.data.version;
  }

  hasTable(table: string): boolean {
    return table in this.data.tables;
  }

  rows(table: string): Row[] {
    let rows = this.rowCache.get(table);
    if (!rows) {
      const t = this.data.tables[table];
      rows = t
        ? t.rows.map((r) => {
            const o: Row = {};
            for (let i = 0; i < t.columns.length; i++) o[t.columns[i]] = r[i] ?? '';
            return o;
          })
        : [];
      this.rowCache.set(table, rows);
    }
    return rows;
  }

  /** First row whose `column` equals `key`. */
  find(table: string, column: string, key: string | number): Row | undefined {
    const id = `${table}\u0000${column}`;
    let map = this.byCache.get(id);
    if (!map) {
      map = new Map();
      for (const r of this.rows(table)) if (!map.has(r[column])) map.set(r[column], r);
      this.byCache.set(id, map);
    }
    return map.get(String(key));
  }

  /** All rows whose `column` equals `key`. */
  group(table: string, column: string, key: string | number): Row[] {
    const id = `${table}\u0000${column}`;
    let map = this.groupCache.get(id);
    if (!map) {
      map = new Map();
      for (const r of this.rows(table)) {
        const list = map.get(r[column]);
        if (list) list.push(r);
        else map.set(r[column], [r]);
      }
      this.groupCache.set(id, map);
    }
    return map.get(String(key)) ?? [];
  }

  /** Localized text for a key; falls back to `fallback` or the key itself. */
  t(key: string | undefined, fallback?: string): string {
    if (!key) return fallback ?? '';
    return this.data.strings[key] ?? fallback ?? key;
  }

  has(key: string): boolean {
    return key in this.data.strings;
  }
}
