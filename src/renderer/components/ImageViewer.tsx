import { useEffect, useRef, useState } from 'react';
import type { CropRect, ImageFile } from '../../shared/types';

interface Props {
  image: ImageFile | null;
  position: { current: number; total: number };
  onSelectionChange: (rect: CropRect | null) => void;
  /** Bumped by the parent to clear the in-flight selection (e.g. on Esc). */
  clearSignal: number;
}

interface DisplayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function ImageViewer({ image, position, onSelectionChange, clearSignal }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [display, setDisplay] = useState<DisplayRect | null>(null);

  // Reset selection when the image changes or the parent asks us to clear.
  useEffect(() => {
    setDisplay(null);
    setDragStart(null);
    onSelectionChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.path, clearSignal]);

  if (!image) {
    return (
      <div className="viewer empty">
        {position.total === 0
          ? 'No images to sort. Open a folder to begin.'
          : 'All images sorted.'}
      </div>
    );
  }

  const onDragStart = (e: React.DragEvent<HTMLImageElement>) => {
    e.dataTransfer.setData('application/x-image-path', image.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  /**
   * Returns the displayed image's bounding box in the wrap's local
   * coordinate system. The image uses object-fit:contain inside the wrap, so
   * its painted area is what the user sees and what selection coords map to.
   */
  const getImgBoxInWrap = () => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return null;
    const ir = img.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    return {
      left: ir.left - wr.left,
      top: ir.top - wr.top,
      width: ir.width,
      height: ir.height,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight
    };
  };

  const finalizeSelection = (d: DisplayRect) => {
    const box = getImgBoxInWrap();
    if (!box || box.width === 0 || box.height === 0 || box.naturalW === 0 || box.naturalH === 0) {
      return;
    }
    if (d.width < 4 || d.height < 4) {
      setDisplay(null);
      onSelectionChange(null);
      return;
    }
    // Clip the selection to the image bounds.
    const left = Math.max(box.left, d.left);
    const top = Math.max(box.top, d.top);
    const right = Math.min(box.left + box.width, d.left + d.width);
    const bottom = Math.min(box.top + box.height, d.top + d.height);
    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom - top);
    if (w < 4 || h < 4) {
      setDisplay(null);
      onSelectionChange(null);
      return;
    }
    setDisplay({ left, top, width: w, height: h });

    const sx = box.naturalW / box.width;
    const sy = box.naturalH / box.height;
    const px: CropRect = {
      x: Math.max(0, Math.round((left - box.left) * sx)),
      y: Math.max(0, Math.round((top - box.top) * sy)),
      width: Math.min(box.naturalW, Math.round(w * sx)),
      height: Math.min(box.naturalH, Math.round(h * sy))
    };
    onSelectionChange(px);
  };

  /**
   * Returns a point in the wrap's local coordinate system, clamped to the
   * displayed image's bounding box. This lets the user start a drag from the
   * letterbox area outside the photo and have it behave as if they'd clicked
   * on the nearest edge pixel.
   */
  const clampedPointOnImage = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    const box = getImgBoxInWrap();
    if (!wrap || !box) return null;
    const wr = wrap.getBoundingClientRect();
    const x = Math.max(box.left, Math.min(box.left + box.width, e.clientX - wr.left));
    const y = Math.max(box.top, Math.min(box.top + box.height, e.clientY - wr.top));
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = clampedPointOnImage(e);
    if (!p) return;
    e.preventDefault();
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setDragStart(p);
    setDisplay({ left: p.x, top: p.y, width: 0, height: 0 });
    onSelectionChange(null);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const p = clampedPointOnImage(e);
    if (!p) return;
    const left = Math.min(dragStart.x, p.x);
    const top = Math.min(dragStart.y, p.y);
    const width = Math.abs(p.x - dragStart.x);
    const height = Math.abs(p.y - dragStart.y);
    setDisplay({ left, top, width, height });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setDragStart(null);
    if (display) finalizeSelection(display);
  };

  return (
    <div className="viewer">
      <div
        className="image-wrap"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imgRef}
          src={image.url}
          alt={image.name}
          draggable
          onDragStart={onDragStart}
        />
        {display && (
          <div
            className="crop-rect"
            style={{
              left: display.left,
              top: display.top,
              width: display.width,
              height: display.height
            }}
          />
        )}
      </div>
      <div className="image-meta">
        {image.name} &mdash; {(image.size / 1024).toFixed(1)} KB &mdash;{' '}
        {position.current + 1} / {position.total}
      </div>
    </div>
  );
}
