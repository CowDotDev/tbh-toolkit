/**
 * Minimal reader for Unity "SerializedFile" containers (format version 22+, Unity 2020+).
 *
 * It only understands what the toolkit needs: the type table (with optional type trees), the
 * object table, and TextAsset payloads. Everything is read-only.
 */

/** Unity's built-in type-tree string table; node names with the high bit set index into this. */
const COMMON_STRINGS = [
  'AABB', 'AnimationClip', 'AnimationCurve', 'AnimationState', 'Array', 'Base', 'BitField', 'bitset', 'bool', 'char',
  'ColorRGBA', 'Component', 'data', 'deque', 'double', 'dynamic_array', 'FastPropertyName', 'first', 'float', 'Font',
  'GameObject', 'Generic Mono', 'GradientNEW', 'GUID', 'GUIStyle', 'int', 'list', 'long long', 'map', 'Matrix4x4f',
  'MdFour', 'MonoBehaviour', 'MonoScript', 'm_ByteSize', 'm_Curve', 'm_EditorClassIdentifier', 'm_EditorHideFlags',
  'm_Enabled', 'm_ExtensionPtr', 'm_GameObject', 'm_Index', 'm_IsArray', 'm_IsStatic', 'm_MetaFlag', 'm_Name',
  'm_ObjectHideFlags', 'm_PrefabInternal', 'm_PrefabParentObject', 'm_Script', 'm_StaticEditorFlags', 'm_Type',
  'm_Version', 'Object', 'pair', 'PPtr<Component>', 'PPtr<GameObject>', 'PPtr<Material>', 'PPtr<MonoBehaviour>',
  'PPtr<MonoScript>', 'PPtr<Object>', 'PPtr<Prefab>', 'PPtr<Sprite>', 'PPtr<TextAsset>', 'PPtr<Texture>',
  'PPtr<Texture2D>', 'PPtr<Transform>', 'Prefab', 'Quaternionf', 'Rectf', 'RectInt', 'RectOffset', 'second', 'set',
  'short', 'size', 'SInt16', 'SInt32', 'SInt64', 'SInt8', 'staticvector', 'string', 'TextAsset', 'TextMesh', 'Texture',
  'Texture2D', 'Transform', 'TypelessData', 'UInt16', 'UInt32', 'UInt64', 'UInt8', 'unsigned int',
  'unsigned long long', 'unsigned short', 'vector', 'Vector2f', 'Vector3f', 'Vector4f', 'm_ScriptingClassIdentifier',
  'Gradient', 'Type*', 'int2_storage', 'int3_storage', 'BoundsInt', 'm_CorrespondingSourceObject', 'm_PrefabInstance',
  'm_PrefabAsset', 'FileSize', 'Hash128', 'RenderingLayerMask',
];
const COMMON_BUFFER = Buffer.from(COMMON_STRINGS.join('\0') + '\0', 'latin1');

export const CLASS_TEXT_ASSET = 49;
export const CLASS_MONO_BEHAVIOUR = 114;

export interface TypeTreeNode {
  level: number;
  type: string;
  name: string;
  meta: number;
}

export interface SerializedType {
  classId: number;
  nodes: TypeTreeNode[] | null;
}

export interface SerializedObject {
  pathId: bigint;
  start: number;
  size: number;
  type: SerializedType;
}

export interface SerializedFile {
  version: number;
  unityVersion: string;
  hasTypeTree: boolean;
  types: SerializedType[];
  objects: SerializedObject[];
}

function cstring(buf: Buffer, offset: number): string {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.toString('utf8', offset, end);
}

export function parseSerializedFile(buf: Buffer): SerializedFile {
  if (buf.length < 64) throw new Error('File is too small to be a Unity serialized file.');
  const version = buf.readUInt32BE(8);
  if (version < 22 || version > 100) throw new Error(`Unsupported Unity serialized file version ${version}.`);
  if (buf[16] !== 0) throw new Error('Big-endian Unity files are not supported.');
  const dataOffset = Number(buf.readBigInt64BE(32));

  let p = 48;
  const unityVersion = cstring(buf, p);
  p += Buffer.byteLength(unityVersion) + 1;
  const i32 = (): number => {
    const v = buf.readInt32LE(p);
    p += 4;
    return v;
  };
  p += 4; // target platform
  const hasTypeTree = buf[p++] !== 0;

  const typeCount = i32();
  const types: SerializedType[] = [];
  for (let t = 0; t < typeCount; t++) {
    const classId = i32();
    p += 1; // isStrippedType
    p += 2; // scriptTypeIndex
    if (classId === CLASS_MONO_BEHAVIOUR) p += 16; // script id
    p += 16; // old type hash
    let nodes: TypeTreeNode[] | null = null;
    if (hasTypeTree) {
      const nodeCount = i32();
      const stringSize = i32();
      const nodeStart = p;
      const stringStart = p + nodeCount * 32;
      const local = buf.subarray(stringStart, stringStart + stringSize);
      const name = (offset: number): string =>
        offset & 0x80000000 ? cstring(COMMON_BUFFER, offset & 0x7fffffff) : cstring(local, offset);
      nodes = [];
      for (let n = 0; n < nodeCount; n++) {
        const b = nodeStart + n * 32;
        nodes.push({
          level: buf[b + 2],
          type: name(buf.readUInt32LE(b + 4)),
          name: name(buf.readUInt32LE(b + 8)),
          meta: buf.readUInt32LE(b + 20),
        });
      }
      p = stringStart + stringSize;
      const dependencyCount = i32();
      p += dependencyCount * 4;
    }
    types.push({ classId, nodes });
  }

  const objectCount = i32();
  const objects: SerializedObject[] = [];
  for (let o = 0; o < objectCount; o++) {
    p = (p + 3) & ~3;
    const pathId = buf.readBigInt64LE(p);
    const start = Number(buf.readBigInt64LE(p + 8)) + dataOffset;
    const size = buf.readUInt32LE(p + 16);
    const typeIndex = buf.readInt32LE(p + 20);
    p += 24;
    const type = types[typeIndex];
    if (!type) throw new Error('Corrupt object table in Unity serialized file.');
    objects.push({ pathId, start, size, type });
  }
  return { version, unityVersion, hasTypeTree, types, objects };
}

/** Returns every TextAsset in the file as name -> raw bytes. */
export function readTextAssets(buf: Buffer): Map<string, Buffer> {
  const file = parseSerializedFile(buf);
  const out = new Map<string, Buffer>();
  for (const obj of file.objects) {
    if (obj.type.classId !== CLASS_TEXT_ASSET) continue;
    let p = obj.start;
    const nameLength = buf.readInt32LE(p);
    p += 4;
    const name = buf.toString('utf8', p, p + nameLength);
    p = (p + nameLength + 3) & ~3;
    const scriptLength = buf.readInt32LE(p);
    p += 4;
    if (scriptLength < 0 || p + scriptLength > buf.length) continue;
    out.set(name, buf.subarray(p, p + scriptLength));
  }
  return out;
}

const PRIMITIVE_SIZES: Record<string, number> = {
  SInt8: 1, UInt8: 1, char: 1, bool: 1,
  SInt16: 2, short: 2, UInt16: 2, 'unsigned short': 2,
  int: 4, SInt32: 4, 'unsigned int': 4, UInt32: 4, 'Type*': 4, float: 4,
  'long long': 8, SInt64: 8, 'unsigned long long': 8, UInt64: 8, FileSize: 8, double: 8,
};
const ALIGN_FLAG = 0x4000;

/**
 * Generic type-tree driven deserializer. 64-bit integers are returned as decimal strings.
 * Parsing stops at a ManagedReferencesRegistry (always the last field), which we do not need.
 */
export function readTypedObject(buf: Buffer, start: number, nodes: TypeTreeNode[]): unknown {
  let p = start;
  let stopped = false;
  const align = (): void => {
    p = (p + 3) & ~3;
  };
  const endOf = (i: number): number => {
    let j = i + 1;
    while (j < nodes.length && nodes[j].level > nodes[i].level) j++;
    return j;
  };

  const read = (i: number): unknown => {
    const node = nodes[i];
    let value: unknown;
    if (node.type === 'ManagedReferencesRegistry') {
      stopped = true;
      return undefined;
    }
    const size = PRIMITIVE_SIZES[node.type];
    if (size !== undefined) {
      if (node.type === 'float') value = buf.readFloatLE(p);
      else if (node.type === 'double') value = buf.readDoubleLE(p);
      else if (node.type === 'bool') value = buf[p] !== 0;
      else if (size === 1) value = buf[p];
      else if (size === 2) value = buf.readInt16LE(p);
      else if (size === 4) value = /^(u|U|Type)/.test(node.type) ? buf.readUInt32LE(p) : buf.readInt32LE(p);
      else value = buf.readBigInt64LE(p).toString();
      p += size;
    } else if (node.type === 'string') {
      const length = buf.readInt32LE(p);
      p += 4;
      value = buf.toString('utf8', p, p + length);
      p += length;
      align();
    } else if (node.type === 'TypelessData') {
      p += 4 + buf.readInt32LE(p);
      value = null;
    } else if (nodes[i + 1]?.type === 'Array' && nodes[i + 1].level === node.level + 1) {
      const arrayNode = i + 1;
      const element = arrayNode + 2;
      const count = buf.readInt32LE(p);
      p += 4;
      if (count < 0 || count > 5_000_000) throw new Error('Corrupt array length in Unity object.');
      const list: unknown[] = [];
      for (let k = 0; k < count && !stopped; k++) list.push(read(element));
      if (nodes[arrayNode].meta & ALIGN_FLAG) align();
      value = list;
    } else {
      const obj: Record<string, unknown> = {};
      const end = endOf(i);
      let child = i + 1;
      while (child < end && !stopped) {
        obj[nodes[child].name] = read(child);
        child = endOf(child);
      }
      value = obj;
    }
    if (node.meta & ALIGN_FLAG) align();
    return value;
  };
  return read(0);
}
