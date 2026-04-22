import { useState } from 'react';
import { EditView } from './components/EditView';
import { OrganizeView } from './components/OrganizeView';

type Mode = 'edit' | 'organize';

export function App() {
  const [mode, setMode] = useState<Mode>('edit');

  return (
    <div className="app">
      <nav className="mode-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'edit'}
          className={`mode-tab ${mode === 'edit' ? 'active' : ''}`}
          onClick={() => setMode('edit')}
        >
          Edit
        </button>
        <button
          role="tab"
          aria-selected={mode === 'organize'}
          className={`mode-tab ${mode === 'organize' ? 'active' : ''}`}
          onClick={() => setMode('organize')}
        >
          Organize
        </button>
      </nav>
      {mode === 'edit' ? <EditView /> : <OrganizeView />}
    </div>
  );
}
