import { useCallback, useEffect, useRef, useState } from 'react';
import type { DestinationFolder, ImageFile, OpenFolderResult, RotationDirection } from '../../shared/types';

export interface SortSession {
  folderPath: string | null;
  images: ImageFile[];
  destinations: DestinationFolder[];
  currentIndex: number;
  current: ImageFile | null;
  totalSorted: number;
  isBusy: boolean;
  status: { kind: 'idle' | 'ok' | 'err'; message: string } | null;

  openFolder: () => Promise<void>;
  refresh: () => Promise<void>;
  next: () => void;
  prev: () => void;
  moveTo: (folder: DestinationFolder) => Promise<void>;
  undo: () => Promise<void>;
  rotate: (direction: RotationDirection) => Promise<void>;
  createSubfolder: (name: string) => Promise<DestinationFolder | null>;
}

export function useSortSession(): SortSession {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [images, setImages] = useState<ImageFile[]>([]);
  const [destinations, setDestinations] = useState<DestinationFolder[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalSorted, setTotalSorted] = useState(0);
  const [isBusy, setBusy] = useState(false);
  const [status, setStatus] = useState<SortSession['status']>(null);

  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  const applyResult = (r: OpenFolderResult) => {
    setFolderPath(r.folderPath);
    setImages(r.images);
    setDestinations(r.destinations);
    setCurrentIndex(0);
    setTotalSorted(0);
  };

  const setError = (e: unknown, fallback: string) => {
    const msg = (e as { message?: string })?.message ?? fallback;
    setStatus({ kind: 'err', message: msg });
  };
  const setOk = (msg: string) => setStatus({ kind: 'ok', message: msg });

  const openFolder = useCallback(async () => {
    setBusy(true);
    try {
      const result = await window.api.openFolder();
      if (result) {
        applyResult(result);
        setOk(`Loaded ${result.images.length} image(s) from ${result.folderPath}`);
      }
    } catch (e) {
      setError(e, 'Failed to open folder');
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!folderPath) return;
    setBusy(true);
    try {
      const result = await window.api.refreshFolder(folderPath);
      applyResult(result);
      setOk('Folder refreshed');
    } catch (e) {
      setError(e, 'Failed to refresh');
    } finally {
      setBusy(false);
    }
  }, [folderPath]);

  const next = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, Math.max(images.length - 1, 0)));
  }, [images.length]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const moveTo = useCallback(
    async (folder: DestinationFolder) => {
      const i = indexRef.current;
      const img = images[i];
      if (!img || isBusy) return;
      setBusy(true);
      try {
        const result = await window.api.moveImage(img.path, folder.path);
        // Remove image from list; keep currentIndex pointing at the next image.
        setImages((prev) => {
          const next = prev.slice();
          next.splice(i, 1);
          return next;
        });
        setCurrentIndex((idx) => Math.min(idx, Math.max(images.length - 2, 0)));
        setTotalSorted((n) => n + 1);
        setOk(
          result.renamed
            ? `Moved as "${result.newPath.split(/[\\/]/).pop()}" (renamed to avoid collision)`
            : `Moved to ${folder.name}`
        );
      } catch (e) {
        setError(e, 'Move failed');
      } finally {
        setBusy(false);
      }
    },
    [images, isBusy]
  );

  const undo = useCallback(async () => {
    if (isBusy || !folderPath) return;
    setBusy(true);
    try {
      const result = await window.api.undoLastMove();
      if (!result) {
        setStatus({ kind: 'idle', message: 'Nothing to undo' });
        return;
      }
      // Re-scan to reflect the restored file.
      const refreshed = await window.api.refreshFolder(folderPath);
      setImages(refreshed.images);
      setDestinations(refreshed.destinations);
      setTotalSorted((n) => Math.max(0, n - 1));
      // Try to focus the restored image.
      const restoredName = result.restoredPath.split(/[\\/]/).pop();
      const newIdx = refreshed.images.findIndex((img) => img.name === restoredName);
      if (newIdx >= 0) setCurrentIndex(newIdx);
      setOk(`Undone: ${restoredName}`);
    } catch (e) {
      setError(e, 'Undo failed');
    } finally {
      setBusy(false);
    }
  }, [folderPath, isBusy]);

  const rotate = useCallback(
    async (direction: RotationDirection) => {
      const i = indexRef.current;
      const img = images[i];
      if (!img || isBusy) return;
      setBusy(true);
      try {
        const result = await window.api.rotateImage(img.path, direction);
        // Cache-bust the URL so the <img> reloads from disk. Always replace
        // any existing query string so repeated rotations don't accumulate.
        const baseUrl = img.url.split('?')[0];
        const newUrl = `${baseUrl}?v=${Date.now()}`;
        setImages((prev) => {
          const next = prev.slice();
          next[i] = { ...next[i], url: newUrl, size: result.size };
          return next;
        });
        setOk(`Rotated ${direction === 'cw' ? 'clockwise' : 'counter-clockwise'}`);
      } catch (e) {
        setError(e, 'Rotation failed');
      } finally {
        setBusy(false);
      }
    },
    [images, isBusy]
  );

  const createSubfolder = useCallback(
    async (name: string) => {
      if (!folderPath) return null;
      try {
        const created = await window.api.createSubfolder(folderPath, name);
        setDestinations((prev) =>
          [...prev, created].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          )
        );
        setOk(`Created folder "${created.name}"`);
        return created;
      } catch (e) {
        setError(e, 'Could not create folder');
        return null;
      }
    },
    [folderPath]
  );

  // Clamp index when images change.
  useEffect(() => {
    if (currentIndex >= images.length) {
      setCurrentIndex(Math.max(images.length - 1, 0));
    }
  }, [images.length, currentIndex]);

  const current = images[currentIndex] ?? null;

  return {
    folderPath,
    images,
    destinations,
    currentIndex,
    current,
    totalSorted,
    isBusy,
    status,
    openFolder,
    refresh,
    next,
    prev,
    moveTo,
    undo,
    rotate,
    createSubfolder
  };
}
