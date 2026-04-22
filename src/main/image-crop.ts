import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { backupPathFor, findMagick, isMagickAvailable } from './image-correct';

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export interface CropRect {
  /** Left edge in source-image pixels (after EXIF orientation is applied). */
  x: number;
  /** Top edge in source-image pixels. */
  y: number;
  /** Width in source-image pixels. */
  width: number;
  /** Height in source-image pixels. */
  height: number;
}

/**
 * Crops the image in place to the given rectangle (in oriented-pixel
 * coordinates, i.e. the same coordinate system the user sees in the viewer).
 *
 * Shares the `<name>.orig.<ext>` backup with auto-correct, so the very first
 * destructive edit on a file preserves the true original; subsequent crops or
 * corrections don't disturb it. Atomic write via temp file + rename.
 */
export async function cropImage(filePath: string, rect: CropRect): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) {
    const err: NodeJS.ErrnoException = new Error(
      `Cropping is not supported for ${ext} files.`
    );
    err.code = 'UNSUPPORTED';
    throw err;
  }

  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w < 2 || h < 2) {
    const err: NodeJS.ErrnoException = new Error('Crop selection is too small.');
    err.code = 'INVALID_NAME';
    throw err;
  }

  if (!(await isMagickAvailable())) {
    const err: NodeJS.ErrnoException = new Error(
      'ImageMagick is not installed or not on PATH. Install it from https://imagemagick.org and restart the app.'
    );
    err.code = 'UNSUPPORTED';
    throw err;
  }
  const magick = (await findMagick())!;

  // Preserve the original on the first destructive edit; subsequent edits
  // (crop or auto-correct) leave the existing backup untouched.
  const backup = backupPathFor(filePath);
  try {
    await fs.copyFile(filePath, backup, fs.constants.COPYFILE_EXCL);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'EEXIST') throw err;
  }

  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.crop-${process.pid}-${Date.now()}${ext}`);

  // -auto-orient bakes EXIF orientation into pixels first so our crop
  // coordinates (taken from the visually-correct rendering) line up with the
  // pixel data. +repage discards the virtual canvas so the output is sized
  // exactly to the crop.
  const args = [
    filePath,
    '-auto-orient',
    '-crop', `${w}x${h}+${x}+${y}`,
    '+repage'
  ];
  if (ext === '.jpg' || ext === '.jpeg') {
    args.push('-quality', '92');
  }
  args.push(tmp);

  try {
    await execFileAsync(magick, args, { windowsHide: true, timeout: 60_000 });
  } catch (e) {
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    const cause = e as { stderr?: string; message?: string };
    const msg = (cause.stderr && cause.stderr.trim()) || cause.message || 'ImageMagick failed';
    const err: NodeJS.ErrnoException = new Error(msg);
    err.code = 'IO';
    throw err;
  }

  try {
    await fs.rename(tmp, filePath);
  } catch (e) {
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    throw e;
  }
}
