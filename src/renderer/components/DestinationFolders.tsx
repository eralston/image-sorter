import { useState } from 'react';
import type { DestinationFolder } from '../../shared/types';

interface Props {
  destinations: DestinationFolder[];
  hasFolderOpen: boolean;
  canMove: boolean;
  onMove: (folder: DestinationFolder) => void;
  onCreate: (name: string) => Promise<DestinationFolder | null>;
}

export function DestinationFolders({ destinations, hasFolderOpen, canMove, onMove, onCreate }: Props) {
  const [newName, setNewName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const v = window.api.validateFolderName(newName);
    if (!v.ok) {
      setValidationError(v.reason ?? 'Invalid name');
      return;
    }
    const result = await onCreate(newName);
    if (result) {
      setNewName('');
      setValidationError(null);
    }
  };

  const handleNameChange = (val: string) => {
    setNewName(val);
    if (val.trim().length === 0) {
      setValidationError(null);
      return;
    }
    const v = window.api.validateFolderName(val);
    setValidationError(v.ok ? null : v.reason ?? null);
  };

  return (
    <aside className="destinations">
      <h3>Destinations</h3>
      <div className="list">
        {!hasFolderOpen && <div className="empty-msg">Open a folder to see destinations.</div>}
        {hasFolderOpen && destinations.length === 0 && (
          <div className="empty-msg">No subfolders yet. Create one below.</div>
        )}
        {destinations.map((d, i) => (
          <div
            key={d.path}
            className={`dest-item ${dragOverPath === d.path ? 'drag-over' : ''}`}
            onClick={() => canMove && onMove(d)}
            onDragOver={(e) => {
              if (!canMove) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverPath(d.path);
            }}
            onDragLeave={() => setDragOverPath((p) => (p === d.path ? null : p))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverPath(null);
              if (!canMove) return;
              const path = e.dataTransfer.getData('application/x-image-path');
              if (path) onMove(d);
            }}
            title={d.path}
          >
            <span>{d.name}</span>
            {i < 9 && <span className="hotkey">{i + 1}</span>}
          </div>
        ))}
      </div>
      {hasFolderOpen && (
        <form className="new-folder-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="New folder name"
            value={newName}
            onChange={(e) => handleNameChange(e.target.value)}
          />
          {validationError && <div className="err">{validationError}</div>}
          <button type="submit" disabled={!newName.trim() || !!validationError}>
            Create folder
          </button>
        </form>
      )}
    </aside>
  );
}
