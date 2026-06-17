import { useState } from 'react';
import { useData } from '../../data';

// Desktop-only: replace the app's database with an existing budget.db file. Hidden in the
// browser (the HTTP/dev build has no Tauri bridge).
const isTauri = typeof window !== 'undefined' && (window as { isTauri?: boolean }).isTauri === true;

export function ImportDatabase() {
  const { refresh } = useData();
  const [busy, setBusy] = useState(false);

  if (!isTauri) return null;

  const onImport = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const selected = await open({ multiple: false, filters: [{ name: 'SQLite database', extensions: ['db'] }] });
    if (typeof selected !== 'string') return;
    if (!window.confirm('Import this database? This replaces all current data in the app.')) return;
    setBusy(true);
    try {
      await invoke('import_database', { srcPath: selected });
      await refresh();
    } catch (e) {
      window.alert(`Import failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10 border-t border-hairline pt-6">
      <h3 className="mb-1 text-sm font-medium text-ink">Import database</h3>
      <p className="mb-3 text-xs text-ink-faint">
        Load an existing <code>budget.db</code> file. This replaces all current data.
      </p>
      <button
        type="button"
        onClick={onImport}
        disabled={busy}
        className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
      >
        {busy ? 'Importing…' : 'Import database…'}
      </button>
    </div>
  );
}
