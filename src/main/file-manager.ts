import { promises as fs } from 'fs';
import * as path from 'path';
import {
  DestinationFolder,
  ImageFile,
  MoveResult,
  OpenFolderResult,
  SUPPORTED_EXTENSIONS,
  UndoResult
} from '../shared/types';

const UNDO_LIMIT = 20;

interface MoveRecord {
  originalPath: string;
  newPath: string;
}

const undoStack: MoveRecord[] = [];

const INVALID_WINDOWS_CHARS = /[<>:"/\\|?*\x00-\x1F]/;
const RESERVED_WINDOWS_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

export function validateFolderName(name: string): { ok: boolean; reason?: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Name cannot be empty.' };
  if (trimmed.length > 255) return { ok: false, reason: 'Name is too long.' };
  if (INVALID_WINDOWS_CHARS.test(trimmed)) {
    return { ok: false, reason: 'Name contains invalid characters: < > : " / \\ | ? *' };
  }
  if (trimmed.endsWith('.') || trimmed.endsWith(' ')) {
    return { ok: false, reason: 'Name cannot end with a space or period.' };
  }
  const upper = trimmed.toUpperCase();
  const baseUpper = upper.split('.')[0];
  if (RESERVED_WINDOWS_NAMES.has(baseUpper)) {
    return { ok: false, reason: `"${trimmed}" is a reserved Windows name.` };
  }
  return { ok: true };
}

function toFileUrl(absPath: string): string {
  // Convert C:\path\to\file.jpg -> safe-file:///C:/path/to/file.jpg
  const normalized = absPath.replace(/\\/g, '/');
  const withSlash = normalized.startsWith('/') ? normalized : '/' + normalized;
  return 'safe-file://' + encodeURI(withSlash);
}

export async function scanFolder(folderPath: string): Promise<OpenFolderResult> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  const imageEntries = entries.filter(
    (e) => e.isFile() && SUPPORTED_EXTENSIONS.includes(path.extname(e.name).toLowerCase() as any)
  );
  const folderEntries = entries.filter((e) => e.isDirectory());

  imageEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  folderEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const images: ImageFile[] = await Promise.all(
    imageEntries.map(async (e) => {
      const abs = path.join(folderPath, e.name);
      const stat = await fs.stat(abs);
      return { path: abs, name: e.name, url: toFileUrl(abs), size: stat.size };
    })
  );

  const destinations: DestinationFolder[] = folderEntries.map((e) => ({
    path: path.join(folderPath, e.name),
    name: e.name
  }));

  return { folderPath, images, destinations };
}

export async function createSubfolder(parentPath: string, name: string): Promise<DestinationFolder> {
  const validation = validateFolderName(name);
  if (!validation.ok) {
    const err: NodeJS.ErrnoException = new Error(validation.reason || 'Invalid folder name');
    err.code = 'INVALID_NAME';
    throw err;
  }
  const target = path.join(parentPath, name.trim());
  try {
    await fs.mkdir(target, { recursive: false });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      const existsErr: NodeJS.ErrnoException = new Error('A folder with that name already exists.');
      existsErr.code = 'COLLISION';
      throw existsErr;
    }
    throw err;
  }
  return { path: target, name: path.basename(target) };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveCollision(destDir: string, fileName: string): Promise<{ finalPath: string; renamed: boolean }> {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(destDir, fileName);
  if (!(await pathExists(candidate))) return { finalPath: candidate, renamed: false };

  for (let i = 1; i < 10000; i++) {
    candidate = path.join(destDir, `${base} (${i})${ext}`);
    if (!(await pathExists(candidate))) return { finalPath: candidate, renamed: true };
  }
  const err: NodeJS.ErrnoException = new Error('Could not find a free filename.');
  err.code = 'COLLISION';
  throw err;
}

export async function moveImage(imagePath: string, destinationFolder: string): Promise<MoveResult> {
  if (!(await pathExists(imagePath))) {
    const err: NodeJS.ErrnoException = new Error('Source image no longer exists.');
    err.code = 'ENOENT';
    throw err;
  }
  if (!(await pathExists(destinationFolder))) {
    const err: NodeJS.ErrnoException = new Error('Destination folder no longer exists.');
    err.code = 'ENOENT';
    throw err;
  }

  const fileName = path.basename(imagePath);
  const { finalPath, renamed } = await resolveCollision(destinationFolder, fileName);

  await moveFile(imagePath, finalPath);

  undoStack.push({ originalPath: imagePath, newPath: finalPath });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();

  return { newPath: finalPath, originalPath: imagePath, renamed };
}

async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // EXDEV = cross-device; fall back to copy + unlink.
    if (err.code === 'EXDEV') {
      await fs.copyFile(from, to);
      await fs.unlink(from);
      return;
    }
    throw err;
  }
}

export async function undoLastMove(): Promise<UndoResult | null> {
  const last = undoStack.pop();
  if (!last) return null;

  if (!(await pathExists(last.newPath))) {
    const err: NodeJS.ErrnoException = new Error('Cannot undo: file no longer exists at its moved location.');
    err.code = 'ENOENT';
    throw err;
  }

  // If the original location is now occupied, restore with a suffix.
  let restoreTarget = last.originalPath;
  if (await pathExists(restoreTarget)) {
    const dir = path.dirname(restoreTarget);
    const fileName = path.basename(restoreTarget);
    const resolved = await resolveCollision(dir, fileName);
    restoreTarget = resolved.finalPath;
  }

  await moveFile(last.newPath, restoreTarget);
  return { restoredPath: restoreTarget, fromPath: last.newPath };
}

export function clearUndoStack(): void {
  undoStack.length = 0;
}
