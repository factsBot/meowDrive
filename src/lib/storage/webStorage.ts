import type { MeowApi } from '../../../shared/ipc';
import { createDexieStorage } from './dexieStorage';
import { SyncEngine } from './sync';
import { supabaseEnabled } from './supabaseClient';

export interface WebStorageHandle {
  api: MeowApi;
  sync: SyncEngine | null;
}

export function createWebStorage(ownerId: string): WebStorageHandle {
  const sync = supabaseEnabled() ? new SyncEngine(ownerId) : null;
  const api = createDexieStorage({
    ownerId,
    onLocalMutation: () => {
      if (sync) void sync.runOnce();
    },
  });
  if (sync) sync.start();
  return { api, sync };
}
