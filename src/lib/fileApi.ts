/**
 * File IO abstraction via Tauri plugin-dialog and plugin-fs.
 * Replaces previous browser-blob download/upload patterns.
 */
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

export interface OpenedFile {
  path: string;
  content: string;
}

export const fileApi = {
  async openProject(): Promise<OpenedFile | null> {
    const path = await openDialog({
      title: 'Open FEM Project',
      filters: [{ name: 'FEM Project', extensions: ['femp', 'json'] }],
      multiple: false,
    });
    if (!path || Array.isArray(path)) return null;
    const content = await readTextFile(path);
    return { path, content };
  },

  async saveProject(content: string, path: string): Promise<void> {
    await writeTextFile(path, content);
  },

  async saveProjectAs(content: string, defaultName?: string): Promise<string | null> {
    const path = await saveDialog({
      title: 'Save FEM Project As',
      defaultPath: defaultName,
      filters: [{ name: 'FEM Project', extensions: ['femp'] }],
    });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  },
};
