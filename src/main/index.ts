import { join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { AppCore, type Settings } from './core/app-core';
import { isInstallDir, isSaveDir } from './core/game-locator';
import { createStoreFactory } from './core/store';
import { mainTools } from './tools';
import type { IpcResult } from '../preload/api';

const EXTERNAL_LINK = /^https:\/\/(github\.com|store\.steampowered\.com)\//;

let window: BrowserWindow | null = null;
let core: AppCore | null = null;

const send = (channel: string, payload?: unknown): void => {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
};

/** Wraps a handler so errors reach the renderer as readable messages instead of IPC noise. */
function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult> => {
    // Only our own window may call in.
    if (!window || event.sender !== window.webContents) return { ok: false, error: 'Unauthorized.' };
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function registerCore(appCore: AppCore): void {
  handle('core:status', () => appCore.status());
  handle('core:refresh', () => {
    appCore.reloadGame();
    appCore.reloadSave();
    return appCore.status();
  });
  handle('core:chooseDir', async (kind) => {
    if (kind !== 'install' && kind !== 'save') throw new Error('Unknown folder type.');
    const result = await dialog.showOpenDialog(window!, {
      title: kind === 'install' ? 'Select the TaskbarHero game folder' : 'Select the TaskbarHero save folder',
      properties: ['openDirectory'],
      defaultPath: (kind === 'install' ? appCore.installDir : appCore.saveDir) ?? undefined,
    });
    const dir = result.filePaths[0];
    if (result.canceled || !dir) return appCore.status();
    if (kind === 'install' && !isInstallDir(dir)) {
      throw new Error('That folder does not contain the game (expected TaskBarHero_Data inside it).');
    }
    if (kind === 'save' && !isSaveDir(dir)) throw new Error('That folder does not contain any .es3 save files.');
    appCore.setDirs(kind === 'install' ? { installDir: dir } : { saveDir: dir });
    return appCore.status();
  });
  handle('core:resetDirs', () => {
    appCore.resetDirs();
    return appCore.status();
  });
  handle('core:openExternal', async (url) => {
    if (typeof url !== 'string' || !EXTERNAL_LINK.test(url)) throw new Error('That link cannot be opened.');
    await shell.openExternal(url);
  });
  handle('core:copyText', (text) => {
    if (typeof text !== 'string' || text.length > 500_000) throw new Error('Nothing to copy.');
    clipboard.writeText(text);
  });
  handle('core:appInfo', () => ({ version: app.getVersion(), electron: process.versions.electron }));

  appCore.on('status', () => send('core:status', appCore.status()));
  appCore.on('save', () => send('core:save', appCore.status()));
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#12141a',
    autoHideMenuBar: true,
    title: 'TBH Toolkit',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => {
    window = null;
  });

  // The UI is a single local page: never navigate away or open child windows.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_LINK.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window?.webContents.getURL()) event.preventDefault();
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  void app.whenReady().then(() => {
    const stores = createStoreFactory(join(app.getPath('userData'), 'data'));
    core = new AppCore(stores<Settings>('settings', {}));
    registerCore(core);

    for (const tool of mainTools) {
      tool.register({
        core,
        handle: (name, fn) => handle(`${tool.id}:${name}`, fn),
        emit: (event, payload) => send(`${tool.id}:${event}`, payload),
        store: (name, fallback) => stores(`${tool.id}-${name}`, fallback),
      });
    }

    core.init();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    for (const tool of mainTools) tool.dispose?.();
    core?.dispose();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
