import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Returns the sibling backup path used to preserve the original pixels before
 * the first auto-correction (e.g. `photo.jpg` -> `photo.orig.jpg`).
 */
export function backupPathFor(filePath: string): string {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  return path.join(path.dirname(filePath), `${base}.orig${ext}`);
}

let magickPath: string | null | undefined = undefined;

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locates the ImageMagick `magick` executable. First tries plain `magick` (PATH),
 * then falls back to scanning the common Windows install directories — the
 * official installer doesn't always add itself to PATH. Result is cached.
 */
async function findMagick(): Promise<string | null> {
  if (magickPath !== undefined) return magickPath;

  // 1. PATH lookup.
  try {
    await execFileAsync('magick', ['-version'], { windowsHide: true, timeout: 5000 });
    magickPath = 'magick';
    return magickPath;
  } catch {
    /* fall through */
  }

  // 2. Common Windows install locations (newest version wins).
  if (process.platform === 'win32') {
    const roots = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env['ProgramW6432']
    ].filter((v): v is string => !!v);

    const candidates: string[] = [];
    for (const root of roots) {
      try {
        const entries = await fs.readdir(root);
        for (const name of entries) {
          if (/^ImageMagick-/i.test(name)) {
            candidates.push(path.join(root, name, 'magick.exe'));
          }
        }
      } catch {
        /* ignore */
      }
    }
    // Sort descending so e.g. ImageMagick-7.1.2 beats ImageMagick-7.1.1.
    candidates.sort().reverse();

    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        try {
          await execFileAsync(candidate, ['-version'], { windowsHide: true, timeout: 5000 });
          magickPath = candidate;
          return magickPath;
        } catch {
          /* try next */
        }
      }
    }
  }

  magickPath = null;
  return null;
}

/** Returns true if a usable `magick` executable was found. */
export async function isMagickAvailable(): Promise<boolean> {
  return (await findMagick()) !== null;
}

/**
 * Applies a general-purpose automatic color correction to the image in place.
 *
 * Uses ImageMagick's per-channel auto-level (which removes color casts by
 * stretching each RGB channel independently), auto-gamma for brightness, and
 * a small contrast stretch for punch. `-auto-orient` bakes any existing EXIF
 * orientation into the pixels so the saved file is upright.
 *
 * Writes via temp file + rename for atomicity.
 */
export async function autoCorrectImage(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) {
    const err: NodeJS.ErrnoException = new Error(
      `Auto color correction is not supported for ${ext} files.`
    );
    err.code = 'UNSUPPORTED';
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

  // Preserve the original pixels on the first correction. `copyFile` with
  // COPYFILE_EXCL is a no-op (throws EEXIST) if a backup already exists, so
  // repeated corrections of the same image keep the very first original.
  const backup = backupPathFor(filePath);
  try {
    await fs.copyFile(filePath, backup, fs.constants.COPYFILE_EXCL);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'EEXIST') throw err;
  }

  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.cc-${process.pid}-${Date.now()}${ext}`);

  const args = [
    filePath,
    '-auto-orient',
    '-auto-level',
    '-auto-gamma',
    '-contrast-stretch', '0.5%x0.5%'
  ];
  if (ext === '.jpg' || ext === '.jpeg') {
    args.push('-quality', '92');
  }
  args.push(tmp);

  try {
    await execFileAsync(magick, args, { windowsHide: true, timeout: 60_000 });
  } catch (e) {
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    const cause = (e as { stderr?: string; message?: string });
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
