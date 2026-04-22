import { useCallback } from 'react';
import { ImageViewer } from './components/ImageViewer';
import { DestinationFolders } from './components/DestinationFolders';
import { useSortSession } from './hooks/useSortSession';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export function App() {
  const session = useSortSession();

  const onQuickSort = useCallback(
    (idx: number) => {
      const folder = session.destinations[idx];
      if (folder) session.moveTo(folder);
    },
    [session]
  );

  useKeyboardShortcuts({
    onNext: session.next,
    onPrev: session.prev,
    onUndo: session.undo,
    onOpenFolder: session.openFolder,
    onQuickSort,
    onRotateCW: () => session.rotate('cw'),
    onRotateCCW: () => session.rotate('ccw'),
    onAutoCorrect: session.autoCorrect,
    onRevertAutoCorrect: session.revertAutoCorrect
  });

  const total = session.images.length;
  const showingIndex = session.current ? session.currentIndex : -1;

  return (
    <div className="app">
      <header className="toolbar">
        <button className="primary" onClick={session.openFolder} disabled={session.isBusy}>
          Open folder…
        </button>
        <button onClick={session.refresh} disabled={!session.folderPath || session.isBusy}>
          Refresh
        </button>
        <button
          onClick={() => session.rotate('ccw')}
          disabled={!session.current || session.isBusy}
          title="Rotate counter-clockwise (Shift+R)"
        >
          ↺ Rotate
        </button>
        <button
          onClick={() => session.rotate('cw')}
          disabled={!session.current || session.isBusy}
          title="Rotate clockwise (R)"
        >
          ↻ Rotate
        </button>
        <button
          onClick={session.autoCorrect}
          disabled={!session.current || session.isBusy}
          title="Auto color correct (C) — requires ImageMagick"
        >
          ✨ Auto-correct
        </button>
        <button
          onClick={session.revertAutoCorrect}
          disabled={!session.current || session.isBusy}
          title="Revert to original (Shift+C) — restores from .orig backup"
        >
          ↶ Revert
        </button>
        <button onClick={session.undo} disabled={session.isBusy}>
          Undo
        </button>
        <span className="folder-path" title={session.folderPath ?? ''}>
          {session.folderPath ?? 'No folder open'}
        </span>
        <span className="spacer" />
        <span className="progress">
          {total > 0
            ? `${showingIndex + 1} of ${total} remaining · ${session.totalSorted} sorted`
            : `${session.totalSorted} sorted`}
        </span>
      </header>

      <div className="main">
        <ImageViewer
          image={session.current}
          position={{ current: session.currentIndex, total }}
        />
        <DestinationFolders
          destinations={session.destinations}
          hasFolderOpen={!!session.folderPath}
          canMove={!!session.current && !session.isBusy}
          onMove={session.moveTo}
          onCreate={session.createSubfolder}
        />
      </div>

      <footer className="statusbar">
        {session.status && (
          <span className={session.status.kind === 'err' ? 'err' : session.status.kind === 'ok' ? 'ok' : ''}>
            {session.status.message}
          </span>
        )}
        <span className="spacer" />
        <span className="hint">← / →: navigate · 1–9: quick sort · R / Shift+R: rotate · C: auto-correct · Shift+C: revert · Ctrl+Z: undo · Ctrl+O: open</span>
      </footer>
    </div>
  );
}
