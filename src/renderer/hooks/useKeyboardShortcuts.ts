import { useEffect } from 'react';

export interface ShortcutHandlers {
  onNext: () => void;
  onPrev: () => void;
  onUndo: () => void;
  onOpenFolder: () => void;
  onQuickSort: (index: number) => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handlers.onUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handlers.onOpenFolder();
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          handlers.onNext();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          handlers.onPrev();
          break;
        case 'r':
          e.preventDefault();
          handlers.onRotateCW();
          break;
        case 'R':
          e.preventDefault();
          handlers.onRotateCCW();
          break;
        default:
          if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            handlers.onQuickSort(parseInt(e.key, 10) - 1);
          }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlers]);
}
