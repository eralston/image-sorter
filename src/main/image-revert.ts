import { promises as fs } from 'fs';
import { backupPathFor } from './image-correct';

/**
 * Restores a previously auto-corrected image from its `.orig` backup sibling.
 * Returns true if a backup existed and was used to overwrite the file; false
 * if no backup was present (i.e. the image was never auto-corrected).
 */
export async function revertAutoCorrect(filePath: string): Promise<boolean> {
  const backup = backupPathFor(filePath);
  try {
    await fs.access(backup);
  } catch {
    return false;
  }
  // rename() replaces the destination atomically on Windows + POSIX, so the
  // corrected file is swapped out and the backup is consumed in one step.
  await fs.rename(backup, filePath);
  return true;
}
