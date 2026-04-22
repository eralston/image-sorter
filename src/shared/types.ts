export const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

export interface ImageFile {
  /** Absolute path on disk. */
  path: string;
  /** File name including extension. */
  name: string;
  /** File URL suitable for `<img src>` (uses the safe-file:// protocol). */
  url: string;
  /** Size in bytes. */
  size: number;
}

export interface DestinationFolder {
  /** Absolute path on disk. */
  path: string;
  /** Display name (basename). */
  name: string;
}

export interface OpenFolderResult {
  folderPath: string;
  images: ImageFile[];
  destinations: DestinationFolder[];
}

export interface MoveResult {
  /** New absolute path of the moved file. */
  newPath: string;
  /** Original absolute path before the move. */
  originalPath: string;
  /** True if the destination filename was auto-suffixed to avoid collision. */
  renamed: boolean;
}

export interface UndoResult {
  /** Path the file was restored to. */
  restoredPath: string;
  /** Path it was moved back from. */
  fromPath: string;
}

export interface AppError {
  code:
    | 'PERMISSION'
    | 'NOT_FOUND'
    | 'INVALID_NAME'
    | 'COLLISION'
    | 'IO'
    | 'CANCELLED'
    | 'UNSUPPORTED'
    | 'UNKNOWN';
  message: string;
}

export type RotationDirection = 'cw' | 'ccw';

export interface CropRect {
  /** Left edge in oriented-image pixels. */
  x: number;
  /** Top edge in oriented-image pixels. */
  y: number;
  /** Width in oriented-image pixels. */
  width: number;
  /** Height in oriented-image pixels. */
  height: number;
}

export interface RotateResult {
  /** Path of the rotated file (unchanged from input). */
  path: string;
  /** New file size in bytes after the rotation was written. */
  size: number;
}

export interface RevertResult {
  /** Path of the file (unchanged from input). */
  path: string;
  /** New file size in bytes; 0 if no revert took place. */
  size: number;
  /** True if a backup existed and was restored; false if there was nothing to revert. */
  reverted: boolean;
}

export interface OrganizeImage {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the scanned root, using forward slashes. */
  relPath: string;
  /** File name including extension. */
  name: string;
  /** File URL suitable for `<img src>` (uses the safe-file:// protocol). */
  url: string;
  /** Size in bytes. */
  size: number;
}

export interface OrganizeScanResult {
  /** The root folder that was scanned. */
  rootPath: string;
  /** All images found beneath the root, with `.orig.*` backups excluded. */
  images: OrganizeImage[];
}

export interface ExportRequest {
  /** Display name for the project; used as the filename suffix. */
  projectName: string;
  /** Absolute path of the target folder where files will be copied. */
  targetFolder: string;
  /** Ordered absolute paths of the source images to copy. */
  orderedSourcePaths: string[];
}

export interface ExportResult {
  /** Number of files copied. */
  copied: number;
  /** Absolute target folder path. */
  targetFolder: string;
}

/** API exposed by the preload script onto window.api. */
export interface AppApi {
  openFolder: () => Promise<OpenFolderResult | null>;
  refreshFolder: (folderPath: string) => Promise<OpenFolderResult>;
  createSubfolder: (parentPath: string, name: string) => Promise<DestinationFolder>;
  moveImage: (imagePath: string, destinationFolder: string) => Promise<MoveResult>;
  undoLastMove: () => Promise<UndoResult | null>;
  rotateImage: (imagePath: string, direction: RotationDirection) => Promise<RotateResult>;
  autoCorrectImage: (imagePath: string) => Promise<RotateResult>;
  cropImage: (imagePath: string, rect: CropRect) => Promise<RotateResult>;
  revertAutoCorrect: (imagePath: string) => Promise<RevertResult>;
  validateFolderName: (name: string) => { ok: boolean; reason?: string };
  pickFolderForOrganize: () => Promise<OrganizeScanResult | null>;
  pickExportTargetFolder: () => Promise<string | null>;
  exportOrganized: (request: ExportRequest) => Promise<ExportResult>;
}

declare global {
  interface Window {
    api: AppApi;
  }
}
