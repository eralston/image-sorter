import type { ImageFile } from '../../shared/types';

interface Props {
  image: ImageFile | null;
  position: { current: number; total: number };
}

export function ImageViewer({ image, position }: Props) {
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

  return (
    <div className="viewer">
      <div className="image-wrap">
        <img
          src={image.url}
          alt={image.name}
          draggable
          onDragStart={onDragStart}
        />
      </div>
      <div className="image-meta">
        {image.name} &mdash; {(image.size / 1024).toFixed(1)} KB &mdash;{' '}
        {position.current + 1} / {position.total}
      </div>
    </div>
  );
}
