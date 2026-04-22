import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi } from '../shared/types';

const api: AppApi = {
  openFolder: () => ipcRenderer.invoke('app:openFolder'),
  refreshFolder: (folderPath) => ipcRenderer.invoke('app:refreshFolder', folderPath),
  createSubfolder: (parentPath, name) => ipcRenderer.invoke('app:createSubfolder', parentPath, name),
  moveImage: (imagePath, destinationFolder) =>
    ipcRenderer.invoke('app:moveImage', imagePath, destinationFolder),
  undoLastMove: () => ipcRenderer.invoke('app:undoLastMove'),
  rotateImage: (imagePath, direction) =>
    ipcRenderer.invoke('app:rotateImage', imagePath, direction),
  autoCorrectImage: (imagePath) => ipcRenderer.invoke('app:autoCorrectImage', imagePath),
  revertAutoCorrect: (imagePath) => ipcRenderer.invoke('app:revertAutoCorrect', imagePath),
  validateFolderName: (name) => {
    // Synchronous-ish: wraps the async IPC. The API contract returns sync; we
    // use a tiny sync stub here that mirrors main-process logic for live UI
    // feedback. Keeping the IPC version available for canonical checks.
    void ipcRenderer; // silence unused in some bundlers
    return validateLocally(name);
  }
};

function validateLocally(name: string): { ok: boolean; reason?: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Name cannot be empty.' };
  if (trimmed.length > 255) return { ok: false, reason: 'Name is too long.' };
  if (/[<>:"/\\|?*\x00-\x1F]/.test(trimmed)) {
    return { ok: false, reason: 'Name contains invalid characters: < > : " / \\ | ? *' };
  }
  if (trimmed.endsWith('.') || trimmed.endsWith(' ')) {
    return { ok: false, reason: 'Name cannot end with a space or period.' };
  }
  const reserved = ['CON','PRN','AUX','NUL','COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9','LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9'];
  const baseUpper = trimmed.toUpperCase().split('.')[0];
  if (reserved.includes(baseUpper)) return { ok: false, reason: `"${trimmed}" is reserved on Windows.` };
  return { ok: true };
}

contextBridge.exposeInMainWorld('api', api);
