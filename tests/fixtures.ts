import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { GameIndex } from '@shared/game-index';
import type { GameData, RawSave, Table } from '@shared/types';

/**
 * Entirely synthetic game data and save, shaped like the real thing. Tests never touch a real
 * save file or ship real game tables.
 */

const table = (columns: string[], rows: (string | number)[][]): Table => ({
  columns,
  rows: rows.map((r) => r.map(String)),
});

export function makeGameData(): GameData {
  return {
    version: '9.9.9',
    tables: {
      HeroInfoData: table(['HeroKey', 'HeroNameKey', 'ClassType'], [
        [101, 'HeroName_101', 'Knight'],
        [201, 'HeroName_201', 'Ranger'],
      ]),
      ItemInfoData: table(['ItemKey', 'GRADE', 'PARTS', 'GEARTYPE', 'NameKey', 'GearKey', 'Level'], [
        [300001, 'RARE', 'MAIN_WEAPON', 'SWORD', 'ItemName_300001', 300001, 10],
        [500001, 'LEGENDARY', 'HELMET', 'HELMET', 'ItemName_500001', 500001, 20],
        [110001, 'COMMON', '', '', 'ItemName_110001', '', ''],
        [790001, 'ARCANA', 'RELIQUARY', 'RELIQUARY', 'ItemName_790001', '', ''],
        [710001, 'RARE', 'RELIC', 'RELIC_RED', 'ItemName_710001', '', ''],
      ]),
      GearInfoData: table(
        ['GearKey', 'BaseStat1_Value', 'BaseStat2_Value', 'InherentStat1_STATTYPE', 'InherentStat1_MODTYPE', 'InherentStat1_Value', 'InherentStat2_STATTYPE', 'InherentStat2_MODTYPE', 'InherentStat2_Value', 'InherentStat3_STATTYPE', 'InherentStat3_MODTYPE', 'InherentStat3_Value', 'UniqueModKey'],
        [
          [300001, 100, 80, 'AttackSpeed', 'ADDITIVE', 150, 'NONE', 'FLAT', 0, 'NONE', 'FLAT', 0, 9001],
          [500001, 400, '', 'MaxHp', 'FLAT', 50, 'NONE', 'FLAT', 0, 'NONE', 'FLAT', 0, ''],
        ],
      ),
      GearTypeInfoData: table(['GearType', 'BaseStat1_STATTYPE', 'BaseStat1_MODTYPE', 'BaseStat2_STATTYPE', 'BaseStat2_MODTYPE'], [
        ['SWORD', 'AttackDamage', 'FLAT', 'AttackSpeed', 'FLAT'],
        ['HELMET', 'Armor', 'FLAT', 'NONE', 'FLAT'],
      ]),
      StatModInfoData: table(['StatModKey', 'Tier', 'STATTYPE', 'MODTYPE', 'MinValue', 'MaxValue', 'Interval'], [
        [100101, 1, 'AttackDamage', 'FLAT', 1, 5, 1],
        [100101, 2, 'AttackDamage', 'FLAT', 5, 10, 1],
        [100201, 1, 'AttackSpeed', 'ADDITIVE', 50, 100, 1],
        [108001, 1, 'CriticalChance', 'FLAT', 10, 30, 1],
      ]),
      MaterialInfoData: table(['ItemKey', 'MATERIALTYPE', 'StatModGroupKey'], [[110001, 'DECORATION', 1]]),
      UniqueModInfoData: table(['UniqueModKey', 'UniqueMod', 'Param1ExchangeType', 'Param1'], [[9001, 'TestMod', 'Raw_Divide1000', 500]]),
      AttributeInfoData: table(['AttributeKey', 'HeroKey', 'GroupKey', 'ATTRIBUTETYPE', 'Value', 'RequiredPoint', 'MaxLevel'], [
        [101001, 101, 10001, 'PASSIVESKILL', 101001, 1, 5],
        [101002, 101, 10001, 'ACTIVESKILL', 10101, 1, 5],
        [201001, 201, 10001, 'PASSIVESKILL', 101001, 1, 5],
      ]),
      AttributeGroupInfoData: table(['AttributeGroupKey', 'RequiredAllocatedPoint'], [[10001, 0]]),
      PassiveSkillInfoData: table(['PassiveSkillKey', 'SkillNameKey', 'STATTYPE', 'MODTYPE', 'Value'], [[101001, 'Passive_AttackDamage', 'AttackDamage', 'FLAT', 2]]),
      SkillInfoData: table(['SkillKey', 'SkillNameKey'], [
        [10001, 'SkillName_10001'],
        [10101, 'SkillName_10101'],
      ]),
      RuneInfoData: table(['RuneKey', 'NameKey', 'MaxLevel', 'LevelDataKey'], [
        [1, 'RuneName_War', 3, 1],
        [2, 'RuneName_Gold', 2, 2],
      ]),
      RuneLevelInfoData: table(['LevelKey', 'Level', 'STATTYPE', 'Value'], [
        [1, 1, 'AllHeroAttackDamage', 1],
        [1, 2, 'AllHeroAttackDamage', 2],
        [1, 3, 'AllHeroAttackDamage', 3],
        [2, 1, 'GoldAmount', 10],
      ]),
      PetInfoData: table(['PetKey', 'NameKey', 'StatDataKey'], [[1001, 'PetName_1001', 1001]]),
      PetStatInfoData: table(['PetStatKey', 'STATTYPE', 'MODTYPE', 'Value'], [[1001, 'AttackDamage', 'FLAT', 7]]),
      ReliquaryInfoData: table(['ItemKey', 'InherentPoolKey'], [[790001, 1001]]),
      StatPoolInfoData: table(['StatPoolKey', 'STATTYPE', 'MODTYPE', 'MinValue', 'MaxValue'], [
        [1001, 'CriticalChance', 'FLAT', 10, 20],
        [1001, 'MaxHp', 'ADDITIVE', 50, 80],
      ]),
      PartyModInfoData: table(['PartyModKey', 'PartyModType', 'PartyMod', 'Param1'], [[20109, 'PartyMod', 'Revive', '']]),
      LevelInfoData: table(['Level', 'ExpForLevelUp'], [
        [1, 100],
        [2, 200],
        [3, 300],
      ]),
    },
    strings: {
      HeroName_101: 'Knight',
      HeroName_201: 'Ranger',
      ItemName_300001: 'Test Sword',
      ItemName_500001: 'Test Helmet',
      ItemName_110001: 'Shiny Gem',
      ItemName_790001: 'Test Reliquary',
      ItemName_710001: 'Test Relic',
      SkillName_10001: 'Basic Attack',
      SkillName_10101: 'Shield Charge',
      Passive_AttackDamage: 'Attack Damage Enhancement',
      RuneName_War: 'Rune of War',
      RuneName_Gold: 'Rune of Wealth',
      PetName_1001: 'Test Pet',
      StatName_AttackDamage: 'Attack Damage',
      StatName_AttackSpeed: 'Attack Speed',
      Stat_AttackDamage_FLAT: 'Attack Damage +{0}',
      Stat_AttackSpeed_FLAT: 'Attack Speed +{0}',
      Stat_AttackSpeed_ADDITIVE: '{0}% Increased Attack Speed',
      Stat_Armor_FLAT: 'Armor +{0}',
      Stat_MaxHp_FLAT: 'Max HP +{0}',
      Stat_CriticalChance_FLAT: 'Critical Chance +{0}%',
      UniqueMod_TestMod: 'Deals {0}% more damage.',
      PartyMod_Revive: 'Revive with {0}% HP. ({1} time(s) per stage)',
    },
  };
}

export const makeIndex = (): GameIndex => new GameIndex(makeGameData());

const BIG_ID_A = '547905569833873801';
const BIG_ID_B = '547905569833873802';

export function makeSave(): RawSave {
  return {
    commonSaveData: { version: '9.9.9', ArrangedPetKey: 1001, arrangedHeroKey: [101, 0, 0] },
    heroSaveDatas: [
      {
        heroKey: 101,
        HeroLevel: 2,
        IsUnLock: true,
        HeroExp: 150,
        AbilityPoint: 0,
        AllocatedHeroAbilityPoint: 4,
        equippedItemIds: [11, BIG_ID_A, 0, 0],
        equippedSKillKey: [10001, 10101, 0],
      },
      { heroKey: 201, HeroLevel: 1, IsUnLock: true, HeroExp: 0, AbilityPoint: 1, AllocatedHeroAbilityPoint: 0, equippedItemIds: [0, 0], equippedSKillKey: [0] },
      { heroKey: 301, HeroLevel: 1, IsUnLock: false, HeroExp: 0, AbilityPoint: 0, AllocatedHeroAbilityPoint: 0, equippedItemIds: [], equippedSKillKey: [] },
    ],
    attributeSaveDatas: [
      { Key: 101001, Level: 3 },
      { Key: 101002, Level: 1 },
      { Key: 201001, Level: 0 },
    ],
    itemSaveDatas: [
      {
        ItemKey: 300001,
        UniqueId: 11,
        IsChaotic: true,
        EnchantData: [
          { StatModKey: 100101, Tier: 2, Value: 8, RecipeType: 3, ModType: 0, MaterialKey: 110001, StatType: 1 },
          { StatModKey: 100201, Tier: 1, Value: 70, RecipeType: 4, ModType: 1, MaterialKey: 0, StatType: 2 },
          { StatModKey: 0, Tier: 0, Value: 0, RecipeType: 0, ModType: 0, MaterialKey: 0, StatType: 0 },
        ],
      },
      { ItemKey: 500001, UniqueId: BIG_ID_A, EnchantData: [] },
      {
        ItemKey: 790001,
        UniqueId: BIG_ID_B,
        EnchantData: [],
        RelicData: {
          Value: 0,
          StatModKey: 0,
          StatTier: 0,
          ResonanceParams: [{ PartyModKey: 20109, Values: [0.14, 1, 0, 0] }],
          InherentStats: [{ StatType: 3, ModType: 0, Value: 14, MinValue: 10, MaxValue: 20 }],
        },
      },
      { ItemKey: 710001, UniqueId: 12, EnchantData: [], RelicData: { Value: 20, StatModKey: 108001, StatTier: 1 } },
    ],
    RuneSaveData: [
      { RuneKey: 1, Level: 2 },
      { RuneKey: 2, Level: 0 },
    ],
    PetSaveData: [{ PetKey: 1001, IsUnlock: true }],
    currenySaveDatas: [{ Key: 100001, Quantity: 987654321 }],
    relicEquipSaveData: { ReliquarySlots: [{ ReliquaryUid: BIG_ID_B, RelicUids: [12, 0] }] },
  };
}

/** Serializes a save the way the game does (test-only; the app itself never writes saves). */
export function encryptTestSave(save: RawSave, password: string, gzip = false): Buffer {
  // Emit the big ids as bare integers, like the real file, to exercise big-int-safe parsing.
  const inner = JSON.stringify(save).replace(/"(\d{16,})"/g, '$1');
  let plain: Buffer = Buffer.from(JSON.stringify({ PlayerSaveData: { __type: 'string', value: inner } }), 'utf8');
  if (gzip) plain = zlib.gzipSync(plain);
  const iv = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, iv, 100, 16, 'sha1');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(plain), cipher.final()]);
}
