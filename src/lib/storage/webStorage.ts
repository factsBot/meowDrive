import type { MeowApi } from '../../../shared/ipc';
import { createDexieStorage } from './dexieStorage';
import { SyncEngine } from './sync';
import { supabaseEnabled } from './supabaseClient';

export interface WebStorageHandle {
  api: MeowApi;
  sync: SyncEngine | null;
}

const SYNC_DEBOUNCE_MS = 100;

export function createWebStorage(ownerId: string): WebStorageHandle {
  const sync = supabaseEnabled() ? new SyncEngine(ownerId) : null;
  let timer: number | null = null;
  function scheduleSync() {
    if (!sync) return;
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void sync.runOnce();
    }, SYNC_DEBOUNCE_MS);
  }
  const api = createDexieStorage({
    ownerId,
    onLocalMutation: scheduleSync,
  });
  if (sync) sync.start();
  return { api, sync };
}
