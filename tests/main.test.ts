import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveBuild, snapshotFromSave } from '@shared/build-model';
import { GameIndex } from '@shared/game-index';
import { loadGameData } from '../src/main/core/game-data';
import { findInstallDir } from '../src/main/core/game-locator';
import { decryptEs3, ES3_PASSWORD, parseSave, readSave } from '../src/main/core/save-reader';
import { JsonStore } from '../src/main/core/store';
import { lz4Decompress, readBundle } from '../src/main/core/unity/bundle';
import { parseSerializedFile, readTextAssets, readTypedObject, type TypeTreeNode } from '../src/main/core/unity/serialized-file';
import { encryptTestSave, makeSave } from './fixtures';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tbh-toolkit-test-'));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('save reader', () => {
  it('decrypts and parses a synthetic save, keeping big ids exact', () => {
    const save = parseSave(encryptTestSave(makeSave(), ES3_PASSWORD));
    expect(save.commonSaveData.version).toBe('9.9.9');
    expect(save.heroSaveDatas[0].equippedItemIds[1]).toBe('547905569833873801');
    expect(save.itemSaveDatas[1].UniqueId).toBe('547905569833873801');
  });

  it('handles gzip-compressed saves', () => {
    const save = parseSave(encryptTestSave(makeSave(), ES3_PASSWORD, true));
    expect(save.heroSaveDatas).toHaveLength(3);
  });

  it('rejects files that are not saves', () => {
    expect(() => decryptEs3(Buffer.from('short'))).toThrow();
    expect(() => parseSave(encryptTestSave(makeSave(), 'a different password'))).toThrow();
    expect(() => parseSave(Buffer.alloc(64, 7))).toThrow();
  });

  it('falls back to the newest backup when the live save is unreadable', () => {
    const dir = path.join(tmp, 'saves');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'SaveFile_Live.es3'), Buffer.alloc(48, 1)); // mid-write garbage
    const older = makeSave();
    older.commonSaveData.version = 'older';
    fs.writeFileSync(path.join(dir, 'SaveFile_Live_1.es3.bak'), encryptTestSave(older, ES3_PASSWORD));
    fs.utimesSync(path.join(dir, 'SaveFile_Live_1.es3.bak'), new Date(1000), new Date(1000));
    fs.writeFileSync(path.join(dir, 'SaveFile_Live_2.es3.bak'), encryptTestSave(makeSave(), ES3_PASSWORD));

    const snapshot = readSave(dir);
    expect(path.basename(snapshot.file)).toBe('SaveFile_Live_2.es3.bak');
    expect(snapshot.save.commonSaveData.version).toBe('9.9.9');
  });

  it('reports a clear error when no save exists', () => {
    const dir = path.join(tmp, 'empty');
    fs.mkdirSync(dir);
    expect(() => readSave(dir)).toThrow(/Could not read a save/);
  });
});

describe('JsonStore', () => {
  it('persists values and survives a corrupt file', () => {
    const file = path.join(tmp, 'store', 'things.json');
    const store = new JsonStore<string[]>(file, []);
    store.update((list) => [...list, 'a']);
    expect(new JsonStore<string[]>(file, []).get()).toEqual(['a']);
    fs.writeFileSync(file, '{not json');
    expect(new JsonStore<string[]>(file, ['fallback']).get()).toEqual(['fallback']);
    fs.writeFileSync(file, '{"an":"object"}');
    expect(new JsonStore<string[]>(file, []).get()).toEqual([]);
  });
});

// ---------- synthetic Unity containers ----------

function alignedString(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8');
  const out = Buffer.alloc(4 + ((bytes.length + 3) & ~3));
  out.writeInt32LE(bytes.length, 0);
  bytes.copy(out, 4);
  return out;
}

/** Builds a tiny version-22 SerializedFile (no type trees) holding the given TextAssets. */
function makeSerializedFile(assets: Record<string, string>): Buffer {
  const payloads = Object.entries(assets).map(([name, text]) => Buffer.concat([alignedString(name), alignedString(text)]));
  const meta: Buffer[] = [];
  meta.push(Buffer.from('6000.0.72f1\0', 'latin1'));
  const platform = Buffer.alloc(5);
  platform.writeInt32LE(19, 0); // + enableTypeTree = 0
  meta.push(platform);
  const types = Buffer.alloc(4 + 23);
  types.writeInt32LE(1, 0); // one type
  types.writeInt32LE(49, 4); // TextAsset; stripped flag, script index and hash stay zero
  meta.push(types);
  const count = Buffer.alloc(4);
  count.writeInt32LE(payloads.length, 0);
  meta.push(count);

  let metaBuf = Buffer.concat(meta);
  const objectTable: Buffer[] = [];
  let offset = 0;
  payloads.forEach((p, i) => {
    const pad = Buffer.alloc(((48 + metaBuf.length + Buffer.concat(objectTable).length + 3) & ~3) - (48 + metaBuf.length + Buffer.concat(objectTable).length));
    const entry = Buffer.alloc(24);
    entry.writeBigInt64LE(BigInt(i + 1), 0);
    entry.writeBigInt64LE(BigInt(offset), 8);
    entry.writeUInt32LE(p.length, 16);
    entry.writeInt32LE(0, 20);
    objectTable.push(pad, entry);
    offset += p.length;
  });
  metaBuf = Buffer.concat([metaBuf, ...objectTable]);

  const dataOffset = (48 + metaBuf.length + 15) & ~15;
  const header = Buffer.alloc(48);
  header.writeUInt32BE(22, 8);
  header.writeUInt32BE(metaBuf.length, 20);
  header.writeBigInt64BE(BigInt(dataOffset + offset), 24);
  header.writeBigInt64BE(BigInt(dataOffset), 32);
  return Buffer.concat([header, metaBuf, Buffer.alloc(dataOffset - 48 - metaBuf.length), ...payloads]);
}

describe('unity readers', () => {
  it('reads TextAssets out of a serialized file', () => {
    const file = makeSerializedFile({ HeroInfoData: 'HeroKey,Name\n101,Knight\n', Notes: 'plain text' });
    const parsed = parseSerializedFile(file);
    expect(parsed.unityVersion).toBe('6000.0.72f1');
    expect(parsed.objects).toHaveLength(2);
    const assets = readTextAssets(file);
    expect([...assets.keys()]).toEqual(['HeroInfoData', 'Notes']);
    expect(assets.get('HeroInfoData')!.toString()).toBe('HeroKey,Name\n101,Knight\n');
  });

  it('rejects files that are not serialized files', () => {
    expect(() => parseSerializedFile(Buffer.alloc(10))).toThrow();
    expect(() => parseSerializedFile(Buffer.alloc(200))).toThrow(/Unsupported/);
    expect(() => readBundle(Buffer.from('NotABundle\0'))).toThrow(/UnityFS/);
  });

  it('decompresses LZ4 blocks including overlapping matches', () => {
    // token 0x1F: 1 literal ('a'), match length 15+4+0 -> extended by 0x00, offset 1 => "a" repeated 20 times
    const block = Buffer.from([0x1f, 0x61, 0x01, 0x00, 0x00, 0x30, 0x62, 0x63, 0x64]);
    expect(lz4Decompress(block, 23).toString()).toBe('a'.repeat(20) + 'bcd');
    expect(() => lz4Decompress(block, 10)).toThrow(/LZ4/);
    expect(() => lz4Decompress(Buffer.from([0x0f, 0x00, 0x00]), 19)).toThrow(/LZ4/);
  });

  it('reads objects through a type tree and stops at the managed-reference registry', () => {
    const n = (level: number, type: string, name: string, meta = 0): TypeTreeNode => ({ level, type, name, meta });
    const nodes: TypeTreeNode[] = [
      n(0, 'MonoBehaviour', 'Base'),
      n(1, 'UInt8', 'm_Enabled', 0x4000),
      n(1, 'string', 'm_Name'),
      n(2, 'Array', 'Array', 0x4000),
      n(3, 'int', 'size'),
      n(3, 'char', 'data'),
      n(1, 'Entry', 'm_Entries'),
      n(2, 'Array', 'Array'),
      n(3, 'int', 'size'),
      n(3, 'Entry', 'data'),
      n(4, 'SInt64', 'm_Id'),
      n(4, 'string', 'm_Key'),
      n(5, 'Array', 'Array', 0x4000),
      n(6, 'int', 'size'),
      n(6, 'char', 'data'),
      n(1, 'ManagedReferencesRegistry', 'references'),
      n(2, 'int', 'version'),
    ];
    const entry = (id: bigint, key: string): Buffer => {
      const b = Buffer.alloc(8);
      b.writeBigInt64LE(id, 0);
      return Buffer.concat([b, alignedString(key)]);
    };
    const count = Buffer.alloc(4);
    count.writeInt32LE(2, 0);
    const data = Buffer.concat([
      Buffer.from([1, 0, 0, 0]),
      alignedString('Table'),
      count,
      entry(60714139914n, 'ItemName_1'),
      entry(3811124920320n, 'GameName'),
      Buffer.from([0xde, 0xad, 0xbe, 0xef]), // registry bytes that must never be read as fields
    ]);
    expect(readTypedObject(data, 0, nodes)).toEqual({
      m_Enabled: 1,
      m_Name: 'Table',
      m_Entries: [
        { m_Id: '60714139914', m_Key: 'ItemName_1' },
        { m_Id: '3811124920320', m_Key: 'GameName' },
      ],
      references: undefined,
    });
  });
});

// ---------- optional: the real install, when this machine has the game ----------

const installDir = process.env.TBH_INSTALL_DIR ?? findInstallDir();

describe.skipIf(!installDir)('real game install (skipped when the game is not installed)', () => {
  it('datamines tables and localized names', () => {
    const { data, warnings } = loadGameData(installDir!);
    expect(warnings).toEqual([]);
    expect(data.version).toMatch(/^\d+\.\d+/);
    for (const table of ['ItemInfoData', 'GearInfoData', 'StatModInfoData', 'HeroInfoData', 'AttributeInfoData', 'LevelInfoData']) {
      expect(data.tables[table]?.rows.length, table).toBeGreaterThan(0);
    }
    const index = new GameIndex(data);
    const hero = index.rows('HeroInfoData')[0];
    expect(index.has(hero.HeroNameKey)).toBe(true);
    expect(index.t('Stat_AttackDamage_FLAT')).toContain('{0}');

    // A build made from game data alone resolves without unknown names.
    const item = index.rows('ItemInfoData').find((r) => r.PARTS === 'MAIN_WEAPON' && r.GearKey)!;
    const resolved = resolveBuild(
      { v: 1, game: data.version, at: 0, label: '', party: [], heroes: [{ k: Number(hero.HeroKey), l: 1, s: [], a: [], g: [{ i: Number(item.ItemKey), e: [] }] }] },
      index,
    );
    expect(resolved.heroes[0].name).not.toMatch(/^Hero \d+$/);
    expect(resolved.heroes[0].gear[0]?.name).not.toMatch(/^(Item \d+|ItemName_)/);
    expect(snapshotFromSave(makeSave(), index).heroes.length).toBeGreaterThan(0);
  });
});
