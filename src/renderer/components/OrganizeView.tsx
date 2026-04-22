import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExportRequest, OrganizeImage } from '../../shared/types';
import { ExportDialog } from './ExportDialog';

interface OrganizeItem extends OrganizeImage {
  selected: boolean;
}

export function OrganizeView() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [items, setItems] = useState<OrganizeItem[]>([]);
  const [isBusy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'idle'; message: string } | null>(null);
  const [showExport, setShowExport] = useState(false);

  const dragIndexRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Stack of indices that were just excluded, most-recent last. Used by the
  // preview lightbox's "Undo" so accidental exclusions can be reversed in
  // order. Cleared whenever a new source folder is loaded; entries are
  // discarded when the corresponding image is re-included by other means.
  const [excludeUndoStack, setExcludeUndoStack] = useState<number[]>([]);

  const setOk = (message: string) => setStatus({ kind: 'ok', message });
  const setErr = (e: unknown, fallback: string) => {
    const msg = (e as { message?: string })?.message ?? fallback;
    setStatus({ kind: 'err', message: msg });
  };

  const pickFolder = useCallback(async () => {
    setBusy(true);
    try {
      const result = await window.api.pickFolderForOrganize();
      if (!result) return;
      setRootPath(result.rootPath);
      setItems(result.images.map((img) => ({ ...img, selected: true })));
      setExcludeUndoStack([]);
      setOk(`Found ${result.images.length} image(s) under ${result.rootPath}`);
    } catch (e) {
      setErr(e, 'Failed to scan folder');
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleSelected = useCallback((index: number) => {
    setItems((prev) => {
      if (!prev[index]) return prev;
      const wasSelected = prev[index].selected;
      const next = prev.slice();
      next[index] = { ...next[index], selected: !wasSelected };
      // If this toggle is an exclusion, push onto the undo stack. If it's an
      // inclusion, drop any matching entry so undo doesn't try to re-exclude.
      setExcludeUndoStack((stack) =>
        wasSelected ? [...stack, index] : stack.filter((i) => i !== index)
      );
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: true })));
    setExcludeUndoStack([]);
  }, []);
  const deselectAll = useCallback(() => {
    setItems((prev) => {
      // Capture every currently-selected index so undo can step back through
      // them one at a time in reverse order.
      const newlyExcluded: number[] = [];
      const next = prev.map((it, i) => {
        if (it.selected) newlyExcluded.push(i);
        return { ...it, selected: false };
      });
      setExcludeUndoStack((stack) => [...stack, ...newlyExcluded]);
      return next;
    });
  }, []);

  const onDragStart = useCallback((index: number, e: React.DragEvent<HTMLDivElement>) => {
    dragIndexRef.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Some browsers require data to be set for drag to initiate.
    try { e.dataTransfer.setData('text/plain', String(index)); } catch { /* ignore */ }
  }, []);

  const onDragOverTile = useCallback((index: number, e: React.DragEvent<HTMLDivElement>) => {
    if (dragIndexRef.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const onDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const onDropTile = useCallback((targetIndex: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
    if (from === null || from === targetIndex) return;
    setItems((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      // When dragging forward, removing the source shifts indices left by one.
      const insertAt = from < targetIndex ? targetIndex - 1 : targetIndex;
      next.splice(insertAt, 0, moved);
      return next;
    });
  }, []);

  const onDropAtEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
    if (from === null) return;
    setItems((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.push(moved);
      return next;
    });
  }, []);

  const onDragOverEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (dragIndexRef.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(items.length);
  }, [items.length]);

  const selectedOrdered = useMemo(() => items.filter((it) => it.selected), [items]);

  // Preview/lightbox state. Holds the absolute index into `items` of the
  // currently previewed (selected) image, or null when the lightbox is closed.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // If the previewed item gets excluded (or items reset), close or advance
  // the lightbox so it never points at a non-selected item.
  useEffect(() => {
    if (previewIndex === null) return;
    if (previewIndex >= items.length || !items[previewIndex]?.selected) {
      // Try to land on the next selected item at or after this position.
      let next: number | null = null;
      for (let i = previewIndex; i < items.length; i++) {
        if (items[i]?.selected) { next = i; break; }
      }
      if (next === null) {
        for (let i = previewIndex - 1; i >= 0; i--) {
          if (items[i]?.selected) { next = i; break; }
        }
      }
      setPreviewIndex(next);
    }
  }, [items, previewIndex]);

  const stepPreview = useCallback(
    (delta: 1 | -1) => {
      setPreviewIndex((current) => {
        if (current === null) return current;
        const len = items.length;
        let i = current + delta;
        while (i >= 0 && i < len) {
          if (items[i]?.selected) return i;
          i += delta;
        }
        return current;
      });
    },
    [items]
  );

  const excludeFromPreview = useCallback(() => {
    setPreviewIndex((current) => {
      if (current === null) return current;
      // Pick the next selected sibling (forward, then backward) before mutating.
      let next: number | null = null;
      for (let i = current + 1; i < items.length; i++) {
        if (items[i]?.selected) { next = i; break; }
      }
      if (next === null) {
        for (let i = current - 1; i >= 0; i--) {
          if (items[i]?.selected) { next = i; break; }
        }
      }
      // Now flip the current item to deselected.
      setItems((prev) => {
        if (!prev[current]) return prev;
        const out = prev.slice();
        out[current] = { ...out[current], selected: false };
        return out;
      });
      setExcludeUndoStack((stack) => [...stack, current]);
      return next;
    });
  }, [items]);

  // Undo the most recent exclusion. Re-includes the image at its original
  // position and jumps the preview to it so the user can confirm. Skips over
  // entries whose item has already been re-included by other means.
  const undoExclude = useCallback(() => {
    setExcludeUndoStack((stack) => {
      const next = stack.slice();
      while (next.length > 0) {
        const idx = next.pop()!;
        const target = items[idx];
        if (!target) continue;
        if (target.selected) continue; // already re-included; skip
        setItems((prev) => {
          if (!prev[idx] || prev[idx].selected) return prev;
          const out = prev.slice();
          out[idx] = { ...out[idx], selected: true };
          return out;
        });
        // Surface the restored image in the preview if it's open.
        setPreviewIndex((cur) => (cur === null ? cur : idx));
        return next;
      }
      return next;
    });
  }, [items]);

  const closePreview = useCallback(() => setPreviewIndex(null), []);

  // Global hotkeys while the lightbox is open: Esc closes; arrows cycle;
  // X excludes the current image and advances. We attach to window so the
  // user doesn't need to focus the lightbox first.
  useEffect(() => {
    if (previewIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePreview();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        stepPreview(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        stepPreview(-1);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoExclude();
      } else if (e.key === 'x' || e.key === 'X' || e.key === 'Delete') {
        e.preventDefault();
        excludeFromPreview();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewIndex, closePreview, stepPreview, excludeFromPreview, undoExclude]);

  const doExport = useCallback(
    async (projectName: string, targetFolder: string) => {
      const request: ExportRequest = {
        projectName,
        targetFolder,
        orderedSourcePaths: selectedOrdered.map((it) => it.path)
      };
      setBusy(true);
      try {
        const result = await window.api.exportOrganized(request);
        setOk(`Exported ${result.copied} image(s) to ${result.targetFolder}`);
        setShowExport(false);
      } catch (e) {
        setErr(e, 'Export failed');
      } finally {
        setBusy(false);
      }
    },
    [selectedOrdered]
  );

  const total = items.length;
  const selectedCount = selectedOrdered.length;

  return (
    <div className="organize">
      <div className="organize-toolbar">
        <button className="primary" onClick={pickFolder} disabled={isBusy}>
          Choose source folder…
        </button>
        <button onClick={selectAll} disabled={total === 0 || isBusy}>
          Select all
        </button>
        <button onClick={deselectAll} disabled={total === 0 || isBusy}>
          Deselect all
        </button>
        <span className="folder-path" title={rootPath ?? ''}>
          {rootPath ?? 'No folder selected'}
        </span>
        <span className="spacer" />
        <span className="progress">
          {total > 0 ? `${selectedCount} of ${total} selected` : '0 images'}
        </span>
        <button
          className="primary"
          onClick={() => setShowExport(true)}
          disabled={selectedCount === 0 || isBusy}
        >
          Export…
        </button>
      </div>

      {total === 0 ? (
        <div className="organize-empty">
          Choose a folder to scan it (and all subfolders) for images.
          <br />
          Backup snapshots ending in <code>.orig.*</code> are ignored.
        </div>
      ) : (
        <div className="organize-grid-wrap">
          <ExcludedTray
            entries={items
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => !item.selected)}
            onRestore={toggleSelected}
            onRestoreAll={selectAll}
          />
          <div className="organize-grid">
            {items.map((item, index) => {
              if (!item.selected) return null;
              const orderNum = items.slice(0, index + 1).filter((it) => it.selected).length;
              const classes = [
                'tile',
                dragIndex === index ? 'dragging' : '',
                dragOverIndex === index ? 'drag-over' : ''
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={item.path}
                  className={classes}
                  draggable
                  onDragStart={(e) => onDragStart(index, e)}
                  onDragOver={(e) => onDragOverTile(index, e)}
                  onDrop={(e) => onDropTile(index, e)}
                  onDragEnd={onDragEnd}
                  title={item.relPath}
                >
                  <div
                    className="tile-thumb"
                    onClick={() => setPreviewIndex(index)}
                    role="button"
                    aria-label={`Preview ${item.name}`}
                  >
                    <img src={item.url} alt={item.name} draggable={false} />
                    <button
                      type="button"
                      className="tile-exclude"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelected(index);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => e.preventDefault()}
                      draggable={false}
                      title="Exclude from export"
                      aria-label="Exclude from export"
                    >
                      ×
                    </button>
                    <span className="tile-order">{orderNum}</span>
                  </div>
                  <div className="tile-meta">
                    <span className="tile-name" title={item.relPath}>{item.relPath}</span>
                  </div>
                </div>
              );
            })}
            <div
              className={`tile-end-drop ${dragOverIndex === items.length ? 'drag-over' : ''}`}
              onDragOver={onDragOverEnd}
              onDrop={onDropAtEnd}
            >
              Drop to move to end
            </div>
          </div>
        </div>
      )}

      <footer className="statusbar">
        {status && (
          <span className={status.kind === 'err' ? 'err' : status.kind === 'ok' ? 'ok' : ''}>
            {status.message}
          </span>
        )}
        <span className="spacer" />
        <span className="hint">
          Drag tiles to reorder · Uncheck a tile to send it to the excluded tray at the top · Restore from the tray to put it back in place
        </span>
      </footer>

      {showExport && (
        <ExportDialog
          defaultProjectName=""
          selectedCount={selectedCount}
          onCancel={() => setShowExport(false)}
          onConfirm={doExport}
          isBusy={isBusy}
        />
      )}

      {previewIndex !== null && items[previewIndex] && (
        <PreviewLightbox
          item={items[previewIndex]}
          orderNum={items.slice(0, previewIndex + 1).filter((it) => it.selected).length}
          totalSelected={selectedCount}
          positionAmongSelected={items.slice(0, previewIndex).filter((it) => it.selected).length + 1}
          canStepPrev={items.slice(0, previewIndex).some((it) => it.selected)}
          canStepNext={items.slice(previewIndex + 1).some((it) => it.selected)}
          canUndo={excludeUndoStack.length > 0}
          onClose={closePreview}
          onPrev={() => stepPreview(-1)}
          onNext={() => stepPreview(1)}
          onExclude={excludeFromPreview}
          onUndo={undoExclude}
        />
      )}
    </div>
  );
}

interface ExcludedEntry {
  item: OrganizeItem;
  index: number;
}

interface ExcludedTrayProps {
  entries: ExcludedEntry[];
  onRestore: (index: number) => void;
  onRestoreAll: () => void;
}

function ExcludedTray({ entries, onRestore, onRestoreAll }: ExcludedTrayProps) {
  const [expanded, setExpanded] = useState(false);
  const count = entries.length;

  return (
    <div className={`excluded-tray ${expanded ? 'expanded' : 'collapsed'} ${count === 0 ? 'empty' : ''}`}>
      <button
        type="button"
        className="excluded-tray-header"
        onClick={() => count > 0 && setExpanded((v) => !v)}
        aria-expanded={expanded}
        disabled={count === 0}
      >
        <span className="excluded-tray-caret">{count === 0 ? '·' : expanded ? '▾' : '▸'}</span>
        <span className="excluded-tray-label">
          {count === 0
            ? 'No excluded images'
            : `${count} excluded image${count === 1 ? '' : 's'}`}
        </span>
        {!expanded && count > 0 && (
          <span className="excluded-tray-preview">
            {entries.slice(0, 12).map((e) => (
              <img
                key={e.item.path}
                src={e.item.url}
                alt=""
                draggable={false}
                title={e.item.relPath}
              />
            ))}
            {count > 12 && <span className="excluded-tray-more">+{count - 12}</span>}
          </span>
        )}
        <span className="excluded-tray-hint">
          {count === 0 ? '' : expanded ? 'click to collapse' : 'click to expand'}
        </span>
      </button>
      {expanded && count > 0 && (
        <div className="excluded-tray-body">
          <div className="excluded-tray-actions">
            <button type="button" onClick={onRestoreAll}>
              Restore all
            </button>
          </div>
          <div className="excluded-tray-grid">
            {entries.map((e) => (
              <div key={e.item.path} className="excluded-mini" title={e.item.relPath}>
                <img src={e.item.url} alt={e.item.name} draggable={false} />
                <button
                  type="button"
                  className="excluded-mini-restore"
                  onClick={() => onRestore(e.index)}
                  title="Re-include in export at its original position"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PreviewLightboxProps {
  item: OrganizeItem;
  orderNum: number;
  totalSelected: number;
  positionAmongSelected: number;
  canStepPrev: boolean;
  canStepNext: boolean;
  canUndo: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onExclude: () => void;
  onUndo: () => void;
}

function PreviewLightbox({
  item,
  orderNum,
  totalSelected,
  positionAmongSelected,
  canStepPrev,
  canStepNext,
  canUndo,
  onClose,
  onPrev,
  onNext,
  onExclude,
  onUndo
}: PreviewLightboxProps) {
  return (
    <div
      className="preview-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className="preview-toolbar" onClick={(e) => e.stopPropagation()}>
        <span className="preview-pos">
          {positionAmongSelected} / {totalSelected}
          <span className="preview-order">order #{orderNum}</span>
        </span>
        <span className="preview-name" title={item.relPath}>{item.relPath}</span>
        <span className="spacer" />
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo last exclusion (Ctrl+Z)"
        >
          ↶ Undo exclude
        </button>
        <button type="button" onClick={onExclude} title="Exclude (X)">
          ✕ Exclude
        </button>
        <button type="button" onClick={onClose} title="Close (Esc)">
          Close
        </button>
      </div>

      <button
        type="button"
        className="preview-nav prev"
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        disabled={!canStepPrev}
        aria-label="Previous image"
        title="Previous (←)"
      >
        ‹
      </button>

      <div className="preview-image-wrap" onClick={(e) => e.stopPropagation()}>
        <img src={item.url} alt={item.name} draggable={false} />
      </div>

      <button
        type="button"
        className="preview-nav next"
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        disabled={!canStepNext}
        aria-label="Next image"
        title="Next (→)"
      >
        ›
      </button>

      <div className="preview-hint" onClick={(e) => e.stopPropagation()}>
        ← / → cycle · X excludes · Ctrl+Z undoes last exclude · Esc closes
      </div>
    </div>
  );
}
