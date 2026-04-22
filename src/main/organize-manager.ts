import { promises as fs } from 'fs';
import * as path from 'path';
import {
  ExportRequest,
  ExportResult,
  OrganizeImage,
  OrganizeScanResult,
  SUPPORTED_EXTENSIONS
} from '../shared/types';
import { validateFolderName } from './file-manager';

/** Matches backup snapshots produced by the editing pipeline (e.g. "photo.orig.jpg"). */
const ORIG_BACKUP_RE = /\.orig\.[^.]+$/i;

/** Folders that should never be descended into during a recursive scan. */
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', '$RECYCLE.BIN', 'System Volume Information']);

function toFileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/');
  const withSlash = normalized.startsWith('/') ? normalized : '/' + normalized;
  return 'safe-file://' + encodeURI(withSlash);
}

function isSupportedImage(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) return false;
  if (ORIG_BACKUP_RE.test(name)) return false;
  return true;
}

async function walk(root: string, current: string, out: OrganizeImage[]): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // Skip folders we can't read; the rest of the scan is still useful.
    if (err.code === 'EACCES' || err.code === 'EPERM') return;
    throw err;
  }

  for (const entry of entries) {
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      await walk(root, abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isSupportedImage(entry.name)) continue;

    let size = 0;
    try {
      const stat = await fs.stat(abs);
      size = stat.size;
    } catch {
      continue;
    }

    out.push({
      path: abs,
      relPath: path.relative(root, abs).split(path.sep).join('/'),
      name: entry.name,
      url: toFileUrl(abs),
      size
    });
  }
}

/** Recursively scan a folder for sortable images, ignoring `.orig.*` backups. */
export async function scanFolderRecursive(rootPath: string): Promise<OrganizeScanResult> {
  const images: OrganizeImage[] = [];
  await walk(rootPath, rootPath, images);

  // Default ordering: by folder, then filename. Using the relative path with a
  // numeric, case-insensitive collation gives a natural "1.jpg < 2.jpg < 10.jpg"
  // sort within each folder while keeping siblings of the same folder together.
  images.sort((a, b) => {
    const ad = path.posix.dirname(a.relPath);
    const bd = path.posix.dirname(b.relPath);
    const dirCmp = ad.localeCompare(bd, undefined, { numeric: true, sensitivity: 'base' });
    if (dirCmp !== 0) return dirCmp;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return { rootPath, images };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

interface PlannedCopy {
  source: string;
  target: string;
  targetName: string;
}

function buildPlan(req: ExportRequest): PlannedCopy[] {
  const total = req.orderedSourcePaths.length;
  const padWidth = String(total).length;
  return req.orderedSourcePaths.map((source, i) => {
    const ext = path.extname(source);
    const idx = String(i + 1).padStart(padWidth, '0');
    const targetName = `${idx}-${req.projectName}${ext}`;
    return {
      source,
      target: path.join(req.targetFolder, targetName),
      targetName
    };
  });
}

/**
 * Copy the requested images to `targetFolder`, prefixing each with its
 * 1-based ordering and the project name. All collisions are detected up
 * front and the operation is aborted before any file is written if any
 * generated name already exists at the destination.
 */
export async function exportOrganized(req: ExportRequest): Promise<ExportResult> {
  const projectName = req.projectName.trim();
  const validation = validateFolderName(projectName);
  if (!validation.ok) {
    const err: NodeJS.ErrnoException = new Error(validation.reason || 'Invalid project name');
    err.code = 'INVALID_NAME';
    throw err;
  }

  if (req.orderedSourcePaths.length === 0) {
    const err: NodeJS.ErrnoException = new Error('No images selected for export.');
    err.code = 'INVALID_NAME';
    throw err;
  }

  if (!(await pathExists(req.targetFolder))) {
    const err: NodeJS.ErrnoException = new Error('Target folder does not exist.');
    err.code = 'ENOENT';
    throw err;
  }

  const plan = buildPlan({ ...req, projectName });

  // Pre-flight: refuse to overwrite anything. Check both pre-existing files
  // at the destination and accidental duplicates within the plan itself.
  const seen = new Set<string>();
  for (const item of plan) {
    if (seen.has(item.target.toLowerCase())) {
      const err: NodeJS.ErrnoException = new Error(
        `Duplicate generated filename: ${item.targetName}`
      );
      err.code = 'COLLISION';
      throw err;
    }
    seen.add(item.target.toLowerCase());
  }

  const collisions: string[] = [];
  for (const item of plan) {
    if (await pathExists(item.target)) collisions.push(item.targetName);
  }
  if (collisions.length > 0) {
    const sample = collisions.slice(0, 3).join(', ');
    const more = collisions.length > 3 ? ` (+${collisions.length - 3} more)` : '';
    const err: NodeJS.ErrnoException = new Error(
      `Target folder already contains files that would be overwritten: ${sample}${more}. Aborted before copying.`
    );
    err.code = 'COLLISION';
    throw err;
  }

  // Verify all sources still exist before starting the copy.
  for (const item of plan) {
    if (!(await pathExists(item.source))) {
      const err: NodeJS.ErrnoException = new Error(`Source image no longer exists: ${item.source}`);
      err.code = 'ENOENT';
      throw err;
    }
  }

  let copied = 0;
  for (const item of plan) {
    await fs.copyFile(item.source, item.target);
    copied++;
  }

  return { copied, targetFolder: req.targetFolder };
}
