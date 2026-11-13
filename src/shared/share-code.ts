import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';
import type { BuildSnapshot } from './types';

/**
 * Share-code format:  TBH1-<base64url( raw-deflate( JSON(BuildSnapshot) ) )>
 *
 * Codes are self-contained (no server) and are treated as untrusted input on import: the length
 * and inflated size are capped and the payload is validated against a strict schema.
 */
export const SHARE_PREFIX = 'TBH1-';
export const MAX_CODE_LENGTH = 200_000;
export const MAX_INFLATED_BYTES = 1_000_000;

const int = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const value = z.number().finite().min(-1e12).max(1e12);

const gearSchema = z.strictObject({
  i: int,
  c: z.literal(1).optional(),
  e: z.array(z.tuple([int, int, value, int, int])).max(16),
});

const heroSchema = z.strictObject({
  k: int,
  l: int.max(100_000),
  s: z.array(int).max(12),
  a: z.array(z.tuple([int, int])).max(500),
  g: z.array(gearSchema.nullable()).max(24),
});

const reliquarySchema = z.strictObject({
  i: int,
  st: z.array(z.tuple([z.union([z.string().max(64).regex(/^[A-Za-z0-9_]+$/), int]), int, value])).max(16),
  rs: z.array(z.array(value).min(1).max(8)).max(16),
  r: z
    .array(z.strictObject({ i: int, m: int, t: int, v: value }).nullable())
    .max(16),
});

export const buildSchema = z.strictObject({
  v: z.literal(1),
  game: z.string().max(32),
  at: int,
  label: z.string().max(80),
  party: z.array(int).max(12),
  heroes: z.array(heroSchema).min(1).max(24),
  runes: z.array(z.tuple([int, int])).max(2000).optional(),
  pet: int.optional(),
  relics: z.array(reliquarySchema).max(12).optional(),
});

export class ShareCodeError extends Error {}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ShareCodeError('The code contains invalid characters.');
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeShareCode(build: BuildSnapshot): string {
  const parsed = buildSchema.safeParse(build);
  if (!parsed.success) throw new ShareCodeError('This build cannot be encoded: ' + z.prettifyError(parsed.error));
  const packed = deflateSync(strToU8(JSON.stringify(parsed.data)), { level: 9 });
  return SHARE_PREFIX + toBase64Url(packed);
}

export function decodeShareCode(input: string): BuildSnapshot {
  const code = input.replace(/\s+/g, '');
  if (!code) throw new ShareCodeError('Paste a share code first.');
  if (code.length > MAX_CODE_LENGTH) throw new ShareCodeError('That code is too long to be a build.');
  if (!code.startsWith(SHARE_PREFIX)) {
    throw new ShareCodeError(`That does not look like a TBH Toolkit share code (it should start with "${SHARE_PREFIX}").`);
  }

  let json: string;
  try {
    const packed = fromBase64Url(code.slice(SHARE_PREFIX.length));
    // A fixed output buffer caps how much a malicious code can inflate to.
    const out = inflateSync(packed, { out: new Uint8Array(MAX_INFLATED_BYTES + 1) });
    if (out.length > MAX_INFLATED_BYTES) throw new ShareCodeError('That code expands to more data than a build can contain.');
    json = strFromU8(out);
  } catch (err) {
    if (err instanceof ShareCodeError) throw err;
    throw new ShareCodeError('That code is damaged or incomplete. Ask your friend to copy it again.');
  }

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ShareCodeError('That code is damaged or incomplete. Ask your friend to copy it again.');
  }
  if (typeof data === 'object' && data !== null && 'v' in data && typeof data.v === 'number' && data.v > 1) {
    throw new ShareCodeError('That code was made with a newer version of TBH Toolkit. Update the app to import it.');
  }
  const parsed = buildSchema.safeParse(data);
  if (!parsed.success) throw new ShareCodeError('That code does not contain a valid build.');
  return parsed.data as BuildSnapshot;
}
