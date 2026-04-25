/// <reference types="vite/client" />
import type { MeowApi } from '../shared/ipc';
import type { SyncEngine } from './lib/storage/sync';

declare global {
  interface Window {
    meow: MeowApi;
    __meowSync?: SyncEngine | null;
  }
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
