import { promises as fs } from 'fs';
import * as path from 'path';
import * as piexif from 'piexifjs';
import { PNG } from 'pngjs';

export type RotationDirection = 'cw' | 'ccw';

/**
 * Rotates an image in-place, preserving quality:
 *   - JPEG: updates only the EXIF Orientation tag (no pixel re-encoding).
 *   - PNG: rotates the raw pixel buffer and re-encodes (PNG is lossless).
 *   - Other formats: throws an error with code 'UNSUPPORTED'.
 *
 * Writes via temp file + rename for atomicity, so a crash mid-write
 * cannot corrupt the original file.
 */
export async function rotateImage(filePath: string, direction: RotationDirection): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    await rotateJpegExif(filePath, direction);
    return;
  }
  if (ext === '.png') {
    await rotatePng(filePath, direction);
    return;
  }
  const err: NodeJS.ErrnoException = new Error(
    `Lossless rotation is not supported for ${ext} files in this version.`
  );
  err.code = 'UNSUPPORTED';
  throw err;
}

// ---------------------------------------------------------------------------
// JPEG: EXIF orientation rotation (no pixel changes)
// ---------------------------------------------------------------------------

// EXIF orientation values:
//   1: top-left (normal)         5: left-top (transposed)
//   2: top-right (mirrored)      6: right-top (rotated 90 CW)
//   3: bottom-right (180)        7: right-bottom (transverse)
//   4: bottom-left (mirrored V)  8: left-bottom (rotated 90 CCW)
const ROTATE_CW_MAP: Record<number, number> = { 1: 6, 2: 7, 3: 8, 4: 5, 5: 2, 6: 3, 7: 4, 8: 1 };
const ROTATE_CCW_MAP: Record<number, number> = { 1: 8, 2: 5, 3: 6, 4: 7, 5: 4, 6: 1, 7: 2, 8: 3 };

async function rotateJpegExif(filePath: string, direction: RotationDirection): Promise<void> {
  const buf = await fs.readFile(filePath);
  // piexifjs uses binary strings.
  const binary = buf.toString('binary');
  const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');

  let exif: ReturnType<typeof piexif.load>;
  try {
    exif = piexif.load(dataUrl);
  } catch {
    // No EXIF block — start with an empty one.
    exif = {};
  }
  if (!exif['0th']) exif['0th'] = {};

  const current = (exif['0th'][piexif.ImageIFD.Orientation] as number | undefined) ?? 1;
  const map = direction === 'cw' ? ROTATE_CW_MAP : ROTATE_CCW_MAP;
  const next = map[current] ?? (direction === 'cw' ? 6 : 8);
  exif['0th'][piexif.ImageIFD.Orientation] = next;

  const exifBytes = piexif.dump(exif);
  // insert() expects a binary string of the JPEG and returns a binary string.
  const newBinary = piexif.insert(exifBytes, binary);
  const outBuf = Buffer.from(newBinary, 'binary');

  await atomicWrite(filePath, outBuf);
}

// ---------------------------------------------------------------------------
// PNG: rotate raw pixel buffer
// ---------------------------------------------------------------------------

async function rotatePng(filePath: string, direction: RotationDirection): Promise<void> {
  const buf = await fs.readFile(filePath);
  const png = PNG.sync.read(buf);

  const { width: w, height: h, data } = png;
  const newWidth = h;
  const newHeight = w;
  const out = Buffer.alloc(data.length);

  // RGBA, 4 bytes per pixel.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 4;
      let dstX: number;
      let dstY: number;
      if (direction === 'cw') {
        // (x, y) -> (h - 1 - y, x)
        dstX = h - 1 - y;
        dstY = x;
      } else {
        // (x, y) -> (y, w - 1 - x)
        dstX = y;
        dstY = w - 1 - x;
      }
      const dstIdx = (dstY * newWidth + dstX) * 4;
      out[dstIdx] = data[srcIdx];
      out[dstIdx + 1] = data[srcIdx + 1];
      out[dstIdx + 2] = data[srcIdx + 2];
      out[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  const rotated = new PNG({ width: newWidth, height: newHeight });
  rotated.data = out;
  const outBuf = PNG.sync.write(rotated);

  await atomicWrite(filePath, outBuf);
}

// ---------------------------------------------------------------------------
// Atomic write: temp file + rename
// ---------------------------------------------------------------------------

async function atomicWrite(targetPath: string, data: Buffer): Promise<void> {
  const dir = path.dirname(targetPath);
  const tmp = path.join(dir, `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`);
  await fs.writeFile(tmp, data);
  try {
    await fs.rename(tmp, targetPath);
  } catch (e) {
    // Best-effort cleanup on failure.
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    throw e;
  }
}
