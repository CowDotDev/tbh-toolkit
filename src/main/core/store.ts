import fs from 'node:fs';
import path from 'node:path';

/** Tiny JSON-file persistence (settings, saved builds, session history). */
export class JsonStore<T> {
  private value: T;

  constructor(
    private readonly file: string,
    fallback: T,
  ) {
    this.value = fallback;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as T;
      if (parsed !== null && typeof parsed === typeof fallback && Array.isArray(parsed) === Array.isArray(fallback)) {
        this.value = parsed;
      }
    } catch {
      // missing or corrupt file: start from the fallback
    }
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, this.file);
  }

  update(fn: (value: T) => T): T {
    this.set(fn(this.value));
    return this.value;
  }
}

export type StoreFactory = <T>(name: string, fallback: T) => JsonStore<T>;

export function createStoreFactory(dir: string): StoreFactory {
  return <T>(name: string, fallback: T) => {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid store name "${name}".`);
    return new JsonStore<T>(path.join(dir, `${name}.json`), fallback);
  };
}
