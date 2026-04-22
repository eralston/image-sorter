import { BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import {
  clearUndoStack,
  createSubfolder,
  moveImage,
  scanFolder,
  undoLastMove,
  validateFolderName
} from './file-manager';
import { rotateImage } from './image-rotation';
import { autoCorrectImage } from './image-correct';
import { revertAutoCorrect } from './image-revert';
import { AppError, RotationDirection } from '../shared/types';

function toAppError(e: unknown): AppError {
  const err = e as NodeJS.ErrnoException;
  const msg = err?.message ?? 'Unknown error';
  switch (err?.code) {
    case 'EACCES':
    case 'EPERM':
      return { code: 'PERMISSION', message: msg };
    case 'ENOENT':
      return { code: 'NOT_FOUND', message: msg };
    case 'INVALID_NAME':
      return { code: 'INVALID_NAME', message: msg };
    case 'COLLISION':
    case 'EEXIST':
      return { code: 'COLLISION', message: msg };
    case 'EBUSY':
    case 'EIO':
      return { code: 'IO', message: msg };
    case 'UNSUPPORTED':
      return { code: 'UNSUPPORTED', message: msg };
    default:
      return { code: 'UNKNOWN', message: msg };
  }
}

function wrap<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (e) {
      throw toAppError(e);
    }
  };
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    'app:openFolder',
    wrap(async () => {
      const win = getWindow();
      const result = await dialog.showOpenDialog(win ?? undefined as any, {
        title: 'Open image folder',
        properties: ['openDirectory']
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const folderPath = result.filePaths[0];
      clearUndoStack();
      return await scanFolder(folderPath);
    })
  );

  ipcMain.handle(
    'app:refreshFolder',
    wrap(async (_e, folderPath: string) => scanFolder(folderPath))
  );

  ipcMain.handle(
    'app:createSubfolder',
    wrap(async (_e, parentPath: string, name: string) => createSubfolder(parentPath, name))
  );

  ipcMain.handle(
    'app:moveImage',
    wrap(async (_e, imagePath: string, destinationFolder: string) =>
      moveImage(imagePath, destinationFolder)
    )
  );

  ipcMain.handle(
    'app:undoLastMove',
    wrap(async () => undoLastMove())
  );

  ipcMain.handle(
    'app:rotateImage',
    wrap(async (_e, imagePath: string, direction: RotationDirection) => {
      await rotateImage(imagePath, direction);
      const stat = await fs.stat(imagePath);
      return { path: imagePath, size: stat.size };
    })
  );

  ipcMain.handle(
    'app:autoCorrectImage',
    wrap(async (_e, imagePath: string) => {
      await autoCorrectImage(imagePath);
      const stat = await fs.stat(imagePath);
      return { path: imagePath, size: stat.size };
    })
  );

  ipcMain.handle(
    'app:revertAutoCorrect',
    wrap(async (_e, imagePath: string) => {
      const reverted = await revertAutoCorrect(imagePath);
      if (!reverted) return { path: imagePath, size: 0, reverted: false };
      const stat = await fs.stat(imagePath);
      return { path: imagePath, size: stat.size, reverted: true };
    })
  );

  ipcMain.handle(
    'app:validateFolderName',
    wrap(async (_e, name: string) => validateFolderName(name))
  );
}
