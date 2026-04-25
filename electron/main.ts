import { app, BrowserWindow, ipcMain, globalShortcut, screen } from 'electron';
import path from 'node:path';
import {
  initDb,
  listCombos,
  favoriteCombos,
  createCombo,
  createEntry,
  updateEntry,
  deleteEntry,
  markEntriesCopied,
  getWeek,
} from './db';
import { IpcChannels } from '../shared/ipc';
import type {
  NewProjectComboInput,
  NewTimeEntryInput,
  UpdateTimeEntryInput,
} from '../shared/types';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(__dirname, '..', 'dist');
const PRELOAD = path.join(__dirname, 'preload.js');

let mainWindow: BrowserWindow | null = null;
let quickLogWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'meowDrive',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createQuickLogWindow(): void {
  if (quickLogWindow && !quickLogWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const { width: dispW } = display.workAreaSize;
  const w = 520;
  const h = 320;

  quickLogWindow = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(dispW / 2 - w / 2),
    y: 80,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    transparent: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    quickLogWindow.loadURL(`${VITE_DEV_SERVER_URL}quicklog.html`);
  } else {
    quickLogWindow.loadFile(path.join(RENDERER_DIST, 'quicklog.html'));
  }

  quickLogWindow.on('blur', () => {
    quickLogWindow?.hide();
  });

  quickLogWindow.on('closed', () => {
    quickLogWindow = null;
  });
}

function showQuickLog(): void {
  if (!quickLogWindow || quickLogWindow.isDestroyed()) {
    createQuickLogWindow();
  }
  quickLogWindow?.show();
  quickLogWindow?.focus();
}

function registerIpc(): void {
  ipcMain.handle(IpcChannels.combosList, () => listCombos());
  ipcMain.handle(IpcChannels.combosFavorites, (_e, limit?: number) =>
    favoriteCombos(limit ?? 5),
  );
  ipcMain.handle(
    IpcChannels.combosCreate,
    (_e, input: NewProjectComboInput) => createCombo(input),
  );

  ipcMain.handle(
    IpcChannels.entriesCreate,
    (_e, input: NewTimeEntryInput) => createEntry(input),
  );
  ipcMain.handle(
    IpcChannels.entriesUpdate,
    (_e, input: UpdateTimeEntryInput) => updateEntry(input),
  );
  ipcMain.handle(
    IpcChannels.entriesDelete,
    (_e, id: string, reason?: string) => deleteEntry(id, reason ?? null),
  );
  ipcMain.handle(IpcChannels.entriesMarkCopied, (_e, ids: string[]) =>
    markEntriesCopied(ids),
  );

  ipcMain.handle(IpcChannels.weekGet, (_e, weekStart: string) =>
    getWeek(weekStart),
  );

  ipcMain.handle(IpcChannels.quickLogHide, () => {
    quickLogWindow?.hide();
  });
}

function registerHotkeys(): void {
  const ok = globalShortcut.register('CommandOrControl+Alt+T', () => {
    showQuickLog();
  });
  if (!ok) {
    console.warn('Failed to register global hotkey Ctrl+Alt+T');
  }
}

app.whenReady().then(() => {
  initDb();
  registerIpc();
  createMainWindow();
  registerHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
