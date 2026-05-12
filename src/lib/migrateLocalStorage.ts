/**
 * One-shot migration from localStorage (Electron era) to Tauri Store.
 * Runs on app startup; idempotent (safe to call repeatedly).
 */
import { storeApi } from './storeApi';

const MIGRATED_FLAG = 'openaec.migration-v1-complete';

const KEYS_TO_MIGRATE = [
  'fem2d-theme',
  'fem2d-locale',
  'fem2d-ribbon-tab',
];

export async function migrateLocalStorageToTauriStore(): Promise<void> {
  const done = await storeApi.get<boolean>(MIGRATED_FLAG);
  if (done) return;

  for (const key of KEYS_TO_MIGRATE) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try {
        await storeApi.set(key, JSON.parse(value));
      } catch {
        await storeApi.set(key, value);
      }
    }
  }

  // Special case: legacy 'dark' theme value → 'openaec'
  const theme = await storeApi.get<string>('fem2d-theme');
  if (theme === 'dark') {
    await storeApi.set('fem2d-theme', 'openaec');
  }

  await storeApi.set(MIGRATED_FLAG, true);
  console.log('[OpenAEC] localStorage → Tauri Store migration complete');
}
