/** Minimal read-only UnityFS (AssetBundle) reader: uncompressed and LZ4/LZ4HC blocks. */

export interface BundleNode {
  name: string;
  data: Buffer;
}

function cstring(buf: Buffer, offset: number): string {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.toString('utf8', offset, end);
}

/** LZ4 block decompression. */
export function lz4Decompress(src: Buffer, outputSize: number): Buffer {
  const dst = Buffer.alloc(outputSize);
  let s = 0;
  let d = 0;
  while (s < src.length) {
    const token = src[s++];
    let literals = token >> 4;
    if (literals === 15) {
      let b: number;
      do {
        b = src[s++];
        literals += b;
      } while (b === 255);
    }
    if (s + literals > src.length || d + literals > outputSize) throw new Error('Corrupt LZ4 data.');
    src.copy(dst, d, s, s + literals);
    s += literals;
    d += literals;
    if (s >= src.length) break;

    const offset = src[s] | (src[s + 1] << 8);
    s += 2;
    let length = token & 15;
    if (length === 15) {
      let b: number;
      do {
        b = src[s++];
        length += b;
      } while (b === 255);
    }
    length += 4;
    let m = d - offset;
    if (offset === 0 || m < 0 || d + length > outputSize) throw new Error('Corrupt LZ4 data.');
    for (let i = 0; i < length; i++) dst[d++] = dst[m++];
  }
  if (d !== outputSize) throw new Error('Corrupt LZ4 data (unexpected size).');
  return dst;
}

function decompress(data: Buffer, size: number, flags: number): Buffer {
  const method = flags & 0x3f;
  if (method === 0) return data;
  if (method === 2 || method === 3) return lz4Decompress(data, size);
  throw new Error(`Unsupported bundle compression method ${method}.`);
}

export function readBundle(buf: Buffer): BundleNode[] {
  let p = 0;
  const signature = cstring(buf, p);
  if (signature !== 'UnityFS') throw new Error('Not a UnityFS bundle.');
  p += signature.length + 1;
  const format = buf.readUInt32BE(p);
  p += 4;
  p += cstring(buf, p).length + 1; // player version
  p += cstring(buf, p).length + 1; // engine version
  p += 8; // total size
  const compressedInfoSize = buf.readUInt32BE(p);
  const infoSize = buf.readUInt32BE(p + 4);
  const flags = buf.readUInt32BE(p + 8);
  p += 12;
  if (format >= 7) p = (p + 15) & ~15;

  let rawInfo: Buffer;
  if (flags & 0x80) {
    rawInfo = buf.subarray(buf.length - compressedInfoSize);
  } else {
    rawInfo = buf.subarray(p, p + compressedInfoSize);
    p += compressedInfoSize;
  }
  const info = decompress(rawInfo, infoSize, flags);
  if (flags & 0x200) p = (p + 15) & ~15;

  let q = 16; // skip hash
  const blockCount = info.readInt32BE(q);
  q += 4;
  const chunks: Buffer[] = [];
  let total = 0;
  for (let b = 0; b < blockCount; b++) {
    const size = info.readUInt32BE(q);
    const compressedSize = info.readUInt32BE(q + 4);
    const blockFlags = info.readUInt16BE(q + 8);
    q += 10;
    total += size;
    if (total > 512 * 1024 * 1024) throw new Error('Bundle is unexpectedly large.');
    chunks.push(decompress(buf.subarray(p, p + compressedSize), size, blockFlags));
    p += compressedSize;
  }
  const data = Buffer.concat(chunks);

  const nodeCount = info.readInt32BE(q);
  q += 4;
  const nodes: BundleNode[] = [];
  for (let n = 0; n < nodeCount; n++) {
    const offset = Number(info.readBigInt64BE(q));
    const size = Number(info.readBigInt64BE(q + 8));
    q += 20; // offset, size, flags
    const name = cstring(info, q);
    q += Buffer.byteLength(name) + 1;
    nodes.push({ name, data: data.subarray(offset, offset + size) });
  }
  return nodes;
}
