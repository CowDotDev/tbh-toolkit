import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseJsonBigSafe } from '@shared/bigint-json';
import type { RawSave, SaveSnapshot } from '@shared/types';

/**
 * The game saves with Easy Save 3: [16-byte IV][AES-128-CBC ciphertext], key derived with
 * PBKDF2-HMAC-SHA1 (100 iterations) using the IV as salt. This is the game's fixed ES3 password,
 * as already published by other open-source community tools. The toolkit only ever reads.
 */
export const ES3_PASSWORD = 'emuMqG3bLYJ938ZDCfieWJ';

export const LIVE_SAVE_NAME = 'SaveFile_Live.es3';

export function decryptEs3(file: Buffer, password = ES3_PASSWORD): Buffer {
  if (file.length < 32 || (file.length - 16) % 16 !== 0) throw new Error('Not an encrypted ES3 save file.');
  const iv = file.subarray(0, 16);
  const key = crypto.pbkdf2Sync(password, iv, 100, 16, 'sha1');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let plain = Buffer.concat([decipher.update(file.subarray(16)), decipher.final()]);
  if (plain[0] === 0x1f && plain[1] === 0x8b) plain = zlib.gunzipSync(plain, { maxOutputLength: 256 * 1024 * 1024 });
  return plain;
}

/** Decrypts and parses a save file's bytes into the player save data. */
export function parseSave(file: Buffer): RawSave {
  const outer = JSON.parse(decryptEs3(file).toString('utf8')) as { PlayerSaveData?: { value?: string } };
  const inner = outer.PlayerSaveData?.value;
  if (typeof inner !== 'string') throw new Error('Save file has no PlayerSaveData.');
  const save = parseJsonBigSafe(inner) as RawSave;
  if (!save || !Array.isArray(save.heroSaveDatas) || !Array.isArray(save.itemSaveDatas) || !save.commonSaveData) {
    throw new Error('Save file has an unexpected layout (the game may have changed its save format).');
  }
  save.attributeSaveDatas ??= [];
  return save;
}

/** Live save first, then rolling backups from newest to oldest. */
export function saveCandidates(saveDir: string): string[] {
  const live = path.join(saveDir, LIVE_SAVE_NAME);
  let backups: { file: string; mtime: number }[] = [];
  try {
    backups = fs
      .readdirSync(saveDir)
      .filter((f) => /^SaveFile_Live.*\.es3(\.bak)?$/i.test(f) && f !== LIVE_SAVE_NAME && !/BackendBackUp/i.test(f))
      .map((f) => {
        const file = path.join(saveDir, f);
        return { file, mtime: fs.statSync(file).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    // directory unreadable: only try the live file
  }
  return [live, ...backups.map((b) => b.file)];
}

/**
 * Reads the newest readable save. The game may be mid-write on the live file, in which case the
 * decrypt fails and we fall back to the most recent rolling backup.
 */
export function readSave(saveDir: string): SaveSnapshot {
  let firstError: Error | null = null;
  for (const file of saveCandidates(saveDir)) {
    try {
      const stat = fs.statSync(file);
      return { file, mtimeMs: stat.mtimeMs, save: parseSave(fs.readFileSync(file)) };
    } catch (err) {
      firstError ??= err as Error;
    }
  }
  throw new Error(`Could not read a save from ${saveDir}: ${firstError?.message ?? 'no save files found'}`);
}
