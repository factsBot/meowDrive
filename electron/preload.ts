import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc';
import type { MeowApi } from '../shared/ipc';

const api: MeowApi = {
  combos: {
    list: () => ipcRenderer.invoke(IpcChannels.combosList),
    create: (input) => ipcRenderer.invoke(IpcChannels.combosCreate, input),
    favorites: (limit) =>
      ipcRenderer.invoke(IpcChannels.combosFavorites, limit),
  },
  entries: {
    create: (input) => ipcRenderer.invoke(IpcChannels.entriesCreate, input),
    update: (input) => ipcRenderer.invoke(IpcChannels.entriesUpdate, input),
    delete: (id, reason) =>
      ipcRenderer.invoke(IpcChannels.entriesDelete, id, reason),
    markCopied: (ids) =>
      ipcRenderer.invoke(IpcChannels.entriesMarkCopied, ids),
  },
  week: {
    get: (weekStart) => ipcRenderer.invoke(IpcChannels.weekGet, weekStart),
  },
  quickLog: {
    hide: () => ipcRenderer.invoke(IpcChannels.quickLogHide),
  },
};

contextBridge.exposeInMainWorld('meow', api);
