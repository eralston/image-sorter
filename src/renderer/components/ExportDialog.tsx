import { useCallback, useState } from 'react';

interface ExportDialogProps {
  defaultProjectName: string;
  selectedCount: number;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (projectName: string, targetFolder: string) => void;
}

export function ExportDialog({
  defaultProjectName,
  selectedCount,
  isBusy,
  onCancel,
  onConfirm
}: ExportDialogProps) {
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [targetFolder, setTargetFolder] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);

  const validate = useCallback((value: string): string | null => {
    const v = value.trim();
    if (v.length === 0) return 'Project name is required.';
    const result = window.api.validateFolderName(v);
    return result.ok ? null : result.reason ?? 'Invalid name.';
  }, []);

  const onNameChange = (value: string) => {
    setProjectName(value);
    setNameError(validate(value));
  };

  const pickTarget = useCallback(async () => {
    const picked = await window.api.pickExportTargetFolder();
    if (picked) setTargetFolder(picked);
  }, []);

  const canExport = !isBusy && !nameError && projectName.trim().length > 0 && targetFolder.length > 0;

  const submit = useCallback(() => {
    const err = validate(projectName);
    setNameError(err);
    if (err || !targetFolder) return;
    onConfirm(projectName.trim(), targetFolder);
  }, [projectName, targetFolder, onConfirm, validate]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export {selectedCount} image{selectedCount === 1 ? '' : 's'}</h2>
        <p className="modal-help">
          Files will be copied to the target folder and renamed using the pattern{' '}
          <code>&lt;number&gt;-&lt;project&gt;.&lt;ext&gt;</code>.
        </p>

        <label className="modal-field">
          <span>Project name</span>
          <input
            type="text"
            value={projectName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. mo-ralston-images"
            autoFocus
            disabled={isBusy}
          />
          {nameError && <span className="err">{nameError}</span>}
        </label>

        <label className="modal-field">
          <span>Target folder</span>
          <div className="modal-folder-row">
            <input type="text" value={targetFolder} readOnly placeholder="No folder chosen" />
            <button type="button" onClick={pickTarget} disabled={isBusy}>
              Choose…
            </button>
          </div>
        </label>

        <div className="modal-actions">
          <button onClick={onCancel} disabled={isBusy}>
            Cancel
          </button>
          <button className="primary" onClick={submit} disabled={!canExport}>
            {isBusy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
