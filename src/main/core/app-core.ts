import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { GameIndex } from '@shared/game-index';
import type { AppStatus, SaveSnapshot } from '@shared/types';
import { loadGameData } from './game-data';
import { findInstallDir, findSaveDir, isInstallDir, isSaveDir } from './game-locator';
import { LIVE_SAVE_NAME, readSave } from './save-reader';
import type { JsonStore } from './store';

export interface Settings {
  installDir?: string;
  saveDir?: string;
}

const WATCH_INTERVAL_MS = 2000;
const SETTLE_MS = 400;

/**
 * Shared services every tool builds on: locating the game, datamining its tables, and reading
 * and watching the save. Electron-free so it can be used from scripts and tests.
 *
 * Events: "save" (SaveSnapshot) whenever a new save is read, "status" whenever status changes.
 */
export class AppCore extends EventEmitter {
  installDir: string | null = null;
  saveDir: string | null = null;
  game: GameIndex | null = null;
  snapshot: SaveSnapshot | null = null;

  private gameErrors: string[] = [];
  private saveError: string | null = null;
  private watched: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly settings: JsonStore<Settings>) {
    super();
  }

  init(): void {
    this.reloadGame();
    this.reloadSave();
  }

  /** (Re)locates the install and datamines the game tables. */
  reloadGame(): void {
    const s = this.settings.get();
    this.gameErrors = [];
    this.game = null;
    this.installDir = s.installDir && isInstallDir(s.installDir) ? s.installDir : findInstallDir();
    if (!this.installDir) {
      this.gameErrors.push('Game install not found. Pick the TaskbarHero folder in Settings.');
    } else {
      try {
        const { data, warnings } = loadGameData(this.installDir);
        this.game = new GameIndex(data);
        this.gameErrors.push(...warnings);
      } catch (err) {
        this.gameErrors.push(`Could not read game data: ${(err as Error).message}`);
      }
    }
    this.emit('status');
  }

  /** (Re)locates the save folder, reads the newest save and (re)starts watching it. */
  reloadSave(): void {
    const s = this.settings.get();
    this.saveDir = s.saveDir && isSaveDir(s.saveDir) ? s.saveDir : findSaveDir();
    this.watch();
    this.readNow();
  }

  private readNow(): void {
    if (!this.saveDir) {
      this.saveError = 'Save folder not found. Pick it in Settings.';
      this.snapshot = null;
      this.emit('status');
      return;
    }
    try {
      const snapshot = readSave(this.saveDir);
      this.saveError = null;
      const changed = !this.snapshot || this.snapshot.mtimeMs !== snapshot.mtimeMs || this.snapshot.file !== snapshot.file;
      this.snapshot = snapshot;
      if (changed) this.emit('save', snapshot);
    } catch (err) {
      this.saveError = (err as Error).message;
    }
    this.emit('status');
  }

  private watch(): void {
    const target = this.saveDir ? path.join(this.saveDir, LIVE_SAVE_NAME) : null;
    if (target === this.watched) return;
    if (this.watched) fs.unwatchFile(this.watched);
    this.watched = target;
    if (!target) return;
    // Polling is the most reliable way to notice the game's autosave on Windows.
    fs.watchFile(target, { interval: WATCH_INTERVAL_MS }, (cur, prev) => {
      if (cur.mtimeMs === prev.mtimeMs) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.readNow(), SETTLE_MS);
    });
  }

  setDirs(patch: Settings): void {
    this.settings.update((s) => ({ ...s, ...patch }));
    this.reloadGame();
    this.reloadSave();
  }

  resetDirs(): void {
    this.settings.set({});
    this.reloadGame();
    this.reloadSave();
  }

  status(): AppStatus {
    return {
      installDir: this.installDir,
      saveDir: this.saveDir,
      gameVersion: this.game?.version || null,
      tableCount: this.game ? Object.keys(this.game.data.tables).length : 0,
      stringCount: this.game ? Object.keys(this.game.data.strings).length : 0,
      saveFile: this.snapshot ? path.basename(this.snapshot.file) : null,
      saveTime: this.snapshot?.mtimeMs ?? null,
      saveVersion: this.snapshot?.save.commonSaveData.version ?? null,
      errors: [...this.gameErrors, ...(this.saveError ? [this.saveError] : [])],
    };
  }

  dispose(): void {
    if (this.watched) fs.unwatchFile(this.watched);
    if (this.timer) clearTimeout(this.timer);
    this.watched = null;
  }
}
