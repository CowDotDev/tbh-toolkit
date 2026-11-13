/**
 * Smoke test against the real local install:  npm run smoke
 * Locates the game + save, datamines the tables, and prints a summary of your current build.
 * Read-only; prints nothing that identifies your account.
 */
import { resolveBuild, snapshotFromSave } from '../src/shared/build-model';
import { GameIndex } from '../src/shared/game-index';
import { decodeShareCode, encodeShareCode } from '../src/shared/share-code';
import { loadGameData } from '../src/main/core/game-data';
import { findInstallDir, findSaveDir } from '../src/main/core/game-locator';
import { readSave } from '../src/main/core/save-reader';

const installDir = process.argv[2] ?? findInstallDir();
const saveDir = process.argv[3] ?? findSaveDir();
if (!installDir) throw new Error('Game install not found. Pass it as the first argument.');
if (!saveDir) throw new Error('Save folder not found. Pass it as the second argument.');
console.log('install :', installDir);
console.log('saves   :', saveDir);

let t = performance.now();
const { data, warnings } = loadGameData(installDir);
console.log(`game    : v${data.version}, ${Object.keys(data.tables).length} tables, ${Object.keys(data.strings).length} strings (${Math.round(performance.now() - t)} ms)`);
for (const w of warnings) console.log('warning :', w);

t = performance.now();
const snap = readSave(saveDir);
console.log(`save    : ${snap.file.split(/[\\/]/).pop()} (v${snap.save.commonSaveData.version}, ${Math.round(performance.now() - t)} ms)`);

const index = new GameIndex(data);
const build = snapshotFromSave(snap.save, index, { label: 'smoke' });
const code = encodeShareCode(build);
const roundTrip = JSON.stringify(decodeShareCode(code)) === JSON.stringify(build);
console.log(`code    : ${code.length} characters, round-trip ${roundTrip ? 'OK' : 'MISMATCH'}`);

const resolved = resolveBuild(build, index);
for (const hero of resolved.heroes) {
  const gear = hero.gear.filter(Boolean);
  console.log(`\n${hero.inParty ? '*' : ' '} ${hero.name} (${hero.className}) Lv ${hero.level} - ${gear.length} items, ${hero.pointsSpent} attribute points`);
  console.log('    skills :', hero.skills.map((s) => s.name).join(', '));
  for (const g of gear) {
    console.log(`    ${g!.part.padEnd(12)} ${g!.name} [${g!.grade} L${g!.level}]${g!.unique ? ' - ' + g!.unique : ''}`);
    if (process.argv.includes('--verbose')) {
      for (const s of [...g!.base, ...g!.inherent]) console.log(`        ${s.text}`);
      for (const e of g!.enchants) console.log(`        ${e.kind} T${e.tier}: ${e.text} (${e.material ?? '?'})`);
    }
  }
  console.log('    totals :', hero.totals.slice(0, 6).map((s) => s.text).join(' | '), hero.totals.length > 6 ? `(+${hero.totals.length - 6} more)` : '');
}
console.log(`\nrunes   : ${resolved.runes.length} learned, e.g. ${resolved.runes.slice(0, 3).map((r) => `${r.name} ${r.level}/${r.max} (${r.effect})`).join('; ')}`);
console.log('pet     :', resolved.pet ? `${resolved.pet.name} - ${resolved.pet.stats.map((s) => s.text).join(', ')}` : 'none');
for (const r of resolved.relics) {
  console.log(`relics  : ${r.name} [${r.grade}] ${r.stats.map((s) => s.text).join(', ')}`);
  for (const line of r.resonance) console.log('          resonance:', line);
  for (const relic of r.relics) if (relic) console.log(`          ${relic.name} [${relic.color}] ${relic.stat?.text ?? ''}`);
}
