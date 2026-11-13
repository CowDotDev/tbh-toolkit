import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LIVE_SAVE_NAME } from './save-reader';

export const STEAM_APP_ID = '3678970';
const SAVE_SUBPATH = path.join('AppData', 'LocalLow', 'TesseractStudio', 'TaskbarHero');
const DEFAULT_INSTALL_NAME = 'TaskbarHero';

const exists = (p: string): boolean => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

/** Steam root folders to try, most likely first. */
function steamRoots(): string[] {
  const roots: string[] = [];
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
      });
      const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match) roots.push(path.normalize(match[1].trim()));
    } catch {
      // registry key missing: fall through to defaults
    }
    roots.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  } else {
    const home = os.homedir();
    roots.push(
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.steam', 'steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
      path.join(home, 'Library', 'Application Support', 'Steam'),
    );
  }
  return [...new Set(roots)];
}

/** Every Steam library folder (a Steam root can list extra libraries on other drives). */
function steamLibraries(): string[] {
  const libraries: string[] = [];
  for (const root of steamRoots()) {
    if (!exists(root)) continue;
    libraries.push(root);
    try {
      const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.push(path.normalize(m[1].replace(/\\\\/g, '\\')));
    } catch {
      // no library list: the root itself is the only library
    }
  }
  return [...new Set(libraries)];
}

/** The registry reports Steam's path in lower case; show the real on-disk casing instead. */
function trueCase(dir: string): string {
  try {
    return fs.realpathSync.native(dir);
  } catch {
    return dir;
  }
}

export function isInstallDir(dir: string): boolean {
  return exists(path.join(dir, 'TaskBarHero_Data', 'sharedassets0.assets'));
}

export function isSaveDir(dir: string): boolean {
  if (exists(path.join(dir, LIVE_SAVE_NAME))) return true;
  try {
    return fs.readdirSync(dir).some((f) => /\.es3(\.bak)?$/i.test(f));
  } catch {
    return false;
  }
}

export function findInstallDir(): string | null {
  for (const library of steamLibraries()) {
    const apps = path.join(library, 'steamapps');
    let name = DEFAULT_INSTALL_NAME;
    try {
      const manifest = fs.readFileSync(path.join(apps, `appmanifest_${STEAM_APP_ID}.acf`), 'utf8');
      name = manifest.match(/"installdir"\s+"([^"]+)"/)?.[1] ?? name;
    } catch {
      // not installed in this library (or manifest missing): still probe the default folder
    }
    const dir = path.join(apps, 'common', name);
    if (isInstallDir(dir)) return trueCase(dir);
  }
  return null;
}

export function findSaveDir(): string | null {
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(path.join(os.homedir(), SAVE_SUBPATH));
  } else {
    // Proton keeps the Windows profile inside the game's compatdata prefix.
    for (const library of steamLibraries()) {
      candidates.push(
        path.join(library, 'steamapps', 'compatdata', STEAM_APP_ID, 'pfx', 'drive_c', 'users', 'steamuser', SAVE_SUBPATH),
      );
    }
  }
  return candidates.find(isSaveDir) ?? null;
}
