import type { MeowApi } from '../shared/ipc';

declare global {
  interface Window {
    meow: MeowApi;
  }
}

export {};
