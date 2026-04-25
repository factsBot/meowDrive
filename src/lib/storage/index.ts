import { createWebStorage } from './webStorage';

export function initWindowMeowFromWeb(ownerId: string): void {
  const handle = createWebStorage(ownerId);
  window.meow = handle.api;
  window.__meowSync = handle.sync;
}

export function isElectronPreloadActive(): boolean {
  return Boolean(window.meow);
}
