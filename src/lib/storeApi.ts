/**
 * Persistent settings store via Tauri plugin-store.
 * Settings persist to ~/.local/share/org.openaec.fem2d-studio/settings.json
 * (or platform equivalent).
 */
import { Store } from '@tauri-apps/plugin-store';

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load('settings.json');
  }
  return storePromise;
}

export const storeApi = {
  async get<T>(key: string): Promise<T | null> {
    const store = await getStore();
    const val = await store.get<T>(key);
    return val ?? null;
  },
  async set<T>(key: string, val: T): Promise<void> {
    const store = await getStore();
    await store.set(key, val);
    await store.save();
  },
  async delete(key: string): Promise<void> {
    const store = await getStore();
    await store.delete(key);
    await store.save();
  },
};
