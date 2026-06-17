import { useState } from 'react';
import { useData } from '../../data';

// Desktop-only: back up / move the app's database. Hidden in the browser (the HTTP/dev build
// has no Tauri bridge).
const isTauri = typeof window !== 'undefined' && (window as { isTauri?: boolean }).isTauri === true;

export function DatabaseTools() {
  const { refresh } = useData();
  const [busy, setBusy] = useState<null | 'import' | 'export'>(null);

  if (!isTauri) return null;

  const onExport = async () => {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const today = new Date().toISOString().slice(0, 10);
    const dest = await save({ defaultPath: `budget-${today}.db`, filters: [{ name: 'SQLite database', extensions: ['db'] }] });
    if (typeof dest !== 'string') return;
    setBusy('export');
    try {
      await invoke('export_database', { destPath: dest });
      window.alert('Database exported.');
    } catch (e) {
      window.alert(`Export failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const selected = await open({ multiple: false, filters: [{ name: 'SQLite database', extensions: ['db'] }] });
    if (typeof selected !== 'string') return;
    if (!window.confirm('Import this database? This replaces all current data in the app.')) return;
    setBusy('import');
    try {
      await invoke('import_database', { srcPath: selected });
      await refresh();
    } catch (e) {
      window.alert(`Import failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-10 border-t border-hairline pt-6">
      <h3 className="mb-1 text-sm font-medium text-ink">Database</h3>
      <p className="mb-3 text-xs text-ink-faint">
        Back up or move your data. <strong>Export</strong> saves a copy of your <code>budget.db</code>;{' '}
        <strong>Import</strong> replaces all current data with a chosen <code>budget.db</code>.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={busy !== null}
          className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {busy === 'export' ? 'Exporting…' : 'Export database…'}
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={busy !== null}
          className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {busy === 'import' ? 'Importing…' : 'Import database…'}
        </button>
      </div>
    </div>
  );
}
