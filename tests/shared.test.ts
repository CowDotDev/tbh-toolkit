import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseJsonBigSafe } from '@shared/bigint-json';
import { resolveBuild, snapshotFromSave, statLine } from '@shared/build-model';
import { parseCsv } from '@shared/csv';
import { diffAttributes, diffRunes, diffStats } from '@shared/diff';
import { computeRates, type RateSample } from '@shared/rates';
import { decodeShareCode, encodeShareCode, SHARE_PREFIX, ShareCodeError } from '@shared/share-code';
import { makeIndex, makeSave } from './fixtures';

describe('parseJsonBigSafe', () => {
  it('keeps 16+ digit integers as exact strings', () => {
    const parsed = parseJsonBigSafe('{"id":547905569833873800,"list":[516371047694221950,7],"small":123456789012345}') as Record<string, unknown>;
    expect(parsed.id).toBe('547905569833873800');
    expect(parsed.list).toEqual(['516371047694221950', 7]);
    expect(parsed.small).toBe(123456789012345);
  });

  it('leaves floats, negatives and string contents alone', () => {
    const parsed = parseJsonBigSafe('{"exp":92447754687.25098,"s":"id 547905569833873800 \\" 1234567890123456789","neg":-12,"e":1e21}') as Record<string, unknown>;
    expect(parsed.exp).toBeCloseTo(92447754687.25098);
    expect(parsed.s).toBe('id 547905569833873800 " 1234567890123456789');
    expect(parsed.neg).toBe(-12);
    expect(parsed.e).toBe(1e21);
  });
});

describe('parseCsv', () => {
  it('handles a BOM, quotes, embedded commas and CRLF', () => {
    const table = parseCsv('﻿Key,Name,Tags\r\n1,Sword,"Melee, AOE"\r\n2,"He said ""hi""",\r\n\r\n');
    expect(table.columns).toEqual(['Key', 'Name', 'Tags']);
    expect(table.rows).toEqual([
      ['1', 'Sword', 'Melee, AOE'],
      ['2', 'He said "hi"', ''],
    ]);
  });
});

describe('build model', () => {
  const index = makeIndex();
  const save = makeSave();

  it('formats stats with the game templates (percent stats are stored x10)', () => {
    expect(statLine(index, 'AttackSpeed', 'ADDITIVE', 192).text).toBe('19.2% Increased Attack Speed');
    expect(statLine(index, 'AttackDamage', 'FLAT', 1174).text).toBe('Attack Damage +1,174');
    expect(statLine(index, 'CriticalChance', 'FLAT', 25).text).toBe('Critical Chance +2.5%');
    expect(statLine(index, 'Mystery', 'FLAT', 5).text).toBe('Mystery +5');
  });

  it('captures unlocked heroes, gear, attributes, runes, pet and relics', () => {
    const build = snapshotFromSave(save, index, { label: 'mine', at: 1000 });
    expect(build.game).toBe('9.9.9');
    expect(build.party).toEqual([101]);
    expect(build.heroes.map((h) => h.k)).toEqual([101, 201]);

    const knight = build.heroes[0];
    expect(knight.s).toEqual([10001, 10101]);
    expect(knight.a).toEqual([
      [101001, 3],
      [101002, 1],
    ]);
    // trailing empty slots are trimmed; empty enchant slots are dropped
    expect(knight.g).toHaveLength(2);
    expect(knight.g[0]).toEqual({ i: 300001, c: 1, e: [[100101, 2, 8, 3, 110001], [100201, 1, 70, 4, 0]] });
    expect(knight.g[1]).toEqual({ i: 500001, e: [] });

    expect(build.runes).toEqual([[1, 2]]);
    expect(build.pet).toBe(1001);
    // StatType 3 was never seen on an enchant, so it is named from the reliquary's stat pool.
    expect(build.relics).toEqual([
      { i: 790001, st: [['CriticalChance', 0, 14]], rs: [[20109, 0.14, 1, 0, 0]], r: [{ i: 710001, m: 108001, t: 1, v: 20 }, null] },
    ]);
  });

  it('never includes item unique ids or currencies in the payload', () => {
    const json = JSON.stringify(snapshotFromSave(save, index));
    expect(json).not.toContain('547905569833873801');
    expect(json).not.toContain('987654321');
  });

  it('honours the hero selection and include flags', () => {
    const build = snapshotFromSave(save, index, { heroKeys: [201, 301], runes: false, pet: false, relics: false });
    expect(build.heroes.map((h) => h.k)).toEqual([201]);
    expect(build.runes).toBeUndefined();
    expect(build.pet).toBeUndefined();
    expect(build.relics).toBeUndefined();
  });

  it('resolves names, enchants and gear stat totals', () => {
    const resolved = resolveBuild(snapshotFromSave(save, index), index);
    const knight = resolved.heroes[0];
    expect(knight.name).toBe('Knight');
    expect(knight.inParty).toBe(true);
    expect(knight.skills.map((s) => s.name)).toEqual(['Basic Attack', 'Shield Charge']);
    expect(knight.pointsSpent).toBe(4);

    const sword = knight.gear[0]!;
    expect(sword.name).toBe('Test Sword');
    expect(sword.part).toBe('MAIN_WEAPON');
    expect(sword.chaotic).toBe(true);
    expect(sword.base.map((s) => s.text)).toEqual(['Attack Damage +100', 'Attack Speed +80']);
    expect(sword.inherent.map((s) => s.text)).toEqual(['15% Increased Attack Speed']);
    expect(sword.unique).toBe('Deals 50% more damage.');
    expect(sword.enchants.map((e) => [e.kind, e.text, e.min, e.max])).toEqual([
      ['Decoration', 'Attack Damage +8', 5, 10],
      ['Engraving', '7% Increased Attack Speed', 50, 100],
    ]);
    expect(sword.enchants[0].material).toBe('Shiny Gem');

    const totals = Object.fromEntries(knight.totals.map((t) => [`${t.stat}|${t.mod}`, t.value]));
    expect(totals).toEqual({ 'AttackDamage|FLAT': 108, 'AttackSpeed|FLAT': 80, 'AttackSpeed|ADDITIVE': 220, 'Armor|FLAT': 400, 'MaxHp|FLAT': 50 });

    const attribute = knight.attributeGroups[0].nodes[0];
    expect(attribute).toMatchObject({ name: 'Attack Damage Enhancement', level: 3, max: 5, effect: 'Attack Damage +6' });

    expect(resolved.runes).toEqual([{ key: 1, name: 'Rune of War', level: 2, max: 3, effect: 'All Hero Attack Damage 3' }]);
    expect(resolved.pet).toMatchObject({ name: 'Test Pet' });
    expect(resolved.relics[0]).toMatchObject({ name: 'Test Reliquary', resonance: ['Revive with 14% HP. (1 time(s) per stage)'] });
    expect(resolved.relics[0].stats[0].text).toBe('Critical Chance +1.4%');
    expect(resolved.relics[0].relics[0]?.stat?.text).toBe('Critical Chance +2%');
    expect(resolved.relics[0].relics[1]).toBeNull();
  });

  it('degrades gracefully when a code references data this install does not have', () => {
    const resolved = resolveBuild(
      { v: 1, game: '1.0', at: 0, label: '', party: [], heroes: [{ k: 999, l: 5, s: [42], a: [[999001, 2]], g: [{ i: 123456, e: [[1, 1, 5, 9, 0]] }] }] },
      index,
    );
    const hero = resolved.heroes[0];
    expect(hero.name).toBe('Hero 999');
    expect(hero.gear[0]?.name).toBe('Item 123456');
    expect(hero.gear[0]?.enchants[0].text).toBe('Stat mod 1 +5');
    expect(hero.attributeGroups[0].nodes[0]).toMatchObject({ name: 'Attribute 999001', level: 2 });
  });
});

describe('diff', () => {
  const index = makeIndex();

  it('compares stat totals in both directions', () => {
    const a = [statLine(index, 'AttackDamage', 'FLAT', 100), statLine(index, 'Armor', 'FLAT', 50)];
    const b = [statLine(index, 'AttackDamage', 'FLAT', 140), statLine(index, 'MaxHp', 'FLAT', 10)];
    const rows = Object.fromEntries(diffStats(a, b).map((r) => [r.key, r.delta]));
    expect(rows).toEqual({ 'AttackDamage|FLAT': 40, 'Armor|FLAT': -50, 'MaxHp|FLAT': 10 });
  });

  it('is empty-safe and reports no differences for identical builds', () => {
    const resolved = resolveBuild(snapshotFromSave(makeSave(), index), index);
    const hero = resolved.heroes[0];
    expect(diffStats(hero.totals, hero.totals).every((r) => r.delta === 0)).toBe(true);
    expect(diffAttributes(hero, hero).every((r) => r.a === r.b)).toBe(true);
    expect(diffRunes(resolved.runes, resolved.runes)).toEqual([]);
    expect(diffAttributes(hero, undefined).every((r) => r.b === 0)).toBe(true);
  });
});

describe('share codes', () => {
  const index = makeIndex();
  const build = snapshotFromSave(makeSave(), index, { label: 'Test build', at: 1234 });

  it('round-trips a build exactly', () => {
    const code = encodeShareCode(build);
    expect(code.startsWith(SHARE_PREFIX)).toBe(true);
    expect(code).toMatch(/^TBH1-[A-Za-z0-9_-]+$/);
    expect(decodeShareCode(code)).toEqual(build);
  });

  it('tolerates whitespace and line breaks from chat apps', () => {
    const code = encodeShareCode(build);
    const mangled = `  ${code.slice(0, 20)}\n${code.slice(20, 60)} \r\n${code.slice(60)}  `;
    expect(decodeShareCode(mangled)).toEqual(build);
  });

  const pack = (value: unknown): string =>
    SHARE_PREFIX + Buffer.from(deflateSync(Buffer.from(JSON.stringify(value)))).toString('base64url');

  it.each([
    ['empty input', ''],
    ['wrong prefix', 'XYZ1-abcdef'],
    ['invalid characters', 'TBH1-!!!!'],
    ['truncated code', encodeShareCode(build).slice(0, 40)],
    ['not json', SHARE_PREFIX + Buffer.from(deflateSync(Buffer.from('hello'))).toString('base64url')],
    ['wrong shape', pack({ v: 1, heroes: 'nope' })],
    ['unknown extra field', pack({ ...build, evil: true })],
    ['no heroes', pack({ ...build, heroes: [] })],
    ['non-integer key', pack({ ...build, heroes: [{ ...build.heroes[0], k: 1.5 }] })],
    ['script in label is fine but oversized label is not', pack({ ...build, label: 'x'.repeat(500) })],
    ['newer format version', pack({ ...build, v: 2 })],
  ])('rejects %s with a readable error', (_name, code) => {
    expect(() => decodeShareCode(code)).toThrow(ShareCodeError);
  });

  it('refuses a decompression bomb', () => {
    const bomb = SHARE_PREFIX + Buffer.from(deflateSync(new Uint8Array(5_000_000))).toString('base64url');
    expect(() => decodeShareCode(bomb)).toThrow(ShareCodeError);
  });

  it('refuses to encode an invalid build', () => {
    expect(() => encodeShareCode({ ...build, heroes: [] })).toThrow(ShareCodeError);
  });
});

describe('computeRates', () => {
  const MIN = 60_000;
  const exp = [0, 100, 200, 300]; // index = level

  it('returns zeros for no samples', () => {
    expect(computeRates([], exp)).toMatchObject({ goldPerHour: 0, xpPerHour: 0, heroes: [] });
  });

  it('measures xp and gold per hour and ignores spending', () => {
    const samples: RateSample[] = [
      { t: 0, gold: 1000, heroes: { 101: { level: 2, exp: 150 } } },
      { t: 10 * MIN, gold: 1600, heroes: { 101: { level: 2, exp: 200 } } },
      { t: 20 * MIN, gold: 900, heroes: { 101: { level: 2, exp: 250 } } }, // spent 700
    ];
    const rates = computeRates(samples, exp);
    expect(rates.goldEarned).toBe(600);
    expect(rates.goldPerHour).toBeCloseTo(1800);
    expect(rates.heroes[0]).toMatchObject({ key: 101, gained: 100 });
    expect(rates.heroes[0].xpPerHour).toBeCloseTo(300);
    // total exp 250 at level 2: level 3 needs 100 + 200 = 300 cumulative
    expect(rates.heroes[0].toNextLevel).toBe(50);
    expect(rates.heroes[0].etaSeconds).toBeCloseTo(600);
  });

  it('only uses the trailing window for rates', () => {
    const samples: RateSample[] = [
      { t: 0, gold: 0, heroes: { 101: { level: 1, exp: 0 } } },
      { t: 60 * MIN, gold: 0, heroes: { 101: { level: 1, exp: 0 } } },
      { t: 70 * MIN, gold: 100, heroes: { 101: { level: 1, exp: 50 } } },
    ];
    const rates = computeRates(samples, exp, 20 * MIN);
    expect(rates.goldPerHour).toBeCloseTo(600);
    expect(rates.heroes[0].xpPerHour).toBeCloseTo(300);
  });

  it('treats heroes past the level table as max level', () => {
    const rates = computeRates(
      [
        { t: 0, gold: 0, heroes: { 101: { level: 101, exp: 9e10 } } },
        { t: MIN, gold: 0, heroes: { 101: { level: 101, exp: 9e10 + 60 } } },
      ],
      exp,
    );
    expect(rates.heroes[0].toNextLevel).toBeUndefined();
    expect(rates.heroes[0].xpPerHour).toBeCloseTo(3600);
  });
});
