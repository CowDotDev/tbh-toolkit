import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from '@shared/csv';
import type { GameData, Table } from '@shared/types';
import { readBundle } from './unity/bundle';
import { CLASS_MONO_BEHAVIOUR, parseSerializedFile, readTextAssets, readTypedObject } from './unity/serialized-file';

const DATA_DIR = 'TaskBarHero_Data';
const TABLE_FILE = 'sharedassets0.assets';
const BUNDLE_DIR = path.join('StreamingAssets', 'aa', 'StandaloneWindows64');

/** Locale tag as it appears in the bundle file names, e.g. "en-us", "ko-kr", "zh-hans". */
export const DEFAULT_LOCALE = 'en-us';

export function readGameVersion(installDir: string): string {
  try {
    return fs.readFileSync(path.join(installDir, 'Version.txt'), 'utf8').trim();
  } catch {
    return '';
  }
}

/** Extracts the game's CSV data tables (TextAssets) from the install. */
export function loadTables(installDir: string): Record<string, Table> {
  const file = path.join(installDir, DATA_DIR, TABLE_FILE);
  const assets = readTextAssets(fs.readFileSync(file));
  const tables: Record<string, Table> = {};
  for (const [name, bytes] of assets) {
    const text = bytes.toString('utf8');
    // Data tables are CSV with a header row; skip anything that is not.
    const firstLine = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'));
    if (!firstLine.includes(',')) continue;
    const table = parseCsv(text);
    if (table.columns.length > 1 && table.rows.length > 0) tables[name] = table;
  }
  if (Object.keys(tables).length === 0) throw new Error(`No data tables found in ${file}.`);
  return tables;
}

interface SharedTableData {
  m_Entries?: { m_Id: string; m_Key: string }[];
}
interface StringTable {
  m_TableData?: { m_Id: string; m_Localized: string }[];
}

function readMonoBehaviours(bundleFile: string): unknown[] {
  const out: unknown[] = [];
  for (const node of readBundle(fs.readFileSync(bundleFile))) {
    if (/\.(resS|resource)$/i.test(node.name)) continue;
    const file = parseSerializedFile(node.data);
    for (const obj of file.objects) {
      if (obj.type.classId === CLASS_MONO_BEHAVIOUR && obj.type.nodes) {
        out.push(readTypedObject(node.data, obj.start, obj.type.nodes));
      }
    }
  }
  return out;
}

/** Reads the Unity Localization string tables: key -> localized text. */
export function loadStrings(installDir: string, locale = DEFAULT_LOCALE): Record<string, string> {
  const dir = path.join(installDir, DATA_DIR, BUNDLE_DIR);
  const files = fs.readdirSync(dir);
  const sharedFile = files.find((f) => f.startsWith('localization-assets-shared') && f.endsWith('.bundle'));
  const localeFile =
    files.find((f) => f.startsWith('localization-string-tables-') && f.includes(`(${locale})`) && f.endsWith('.bundle')) ??
    files.find((f) => f.startsWith('localization-string-tables-') && f.includes(`(${DEFAULT_LOCALE})`));
  if (!sharedFile || !localeFile) throw new Error('Localization bundles were not found in the game install.');

  const keyById = new Map<string, string>();
  for (const mb of readMonoBehaviours(path.join(dir, sharedFile)) as SharedTableData[]) {
    for (const e of mb.m_Entries ?? []) keyById.set(e.m_Id, e.m_Key);
  }
  const strings: Record<string, string> = {};
  for (const mb of readMonoBehaviours(path.join(dir, localeFile)) as StringTable[]) {
    for (const e of mb.m_TableData ?? []) {
      const key = keyById.get(e.m_Id);
      if (key) strings[key] = e.m_Localized;
    }
  }
  return strings;
}

export interface LoadedGameData {
  data: GameData;
  warnings: string[];
}

export function loadGameData(installDir: string, locale = DEFAULT_LOCALE): LoadedGameData {
  const warnings: string[] = [];
  const tables = loadTables(installDir);
  let strings: Record<string, string> = {};
  try {
    strings = loadStrings(installDir, locale);
  } catch (err) {
    warnings.push(`Could not read the game's text tables, so names are shown as raw keys. (${(err as Error).message})`);
  }
  return { data: { version: readGameVersion(installDir), tables, strings }, warnings };
}
