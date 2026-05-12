/**
 * Window API abstraction for Tauri v2.
 * Used by TitleBar component for window controls.
 */
import { getCurrentWindow } from '@tauri-apps/api/window';

export const windowApi = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  startDragging: () => getCurrentWindow().startDragging(),
};
