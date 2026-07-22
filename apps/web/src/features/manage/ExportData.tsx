import { useState } from 'react';
import type { LedgerData } from '@budget/core';
import { buildCsvExport, buildJsonExport } from '../../lib/export';
import { todayISO } from '../../lib/dates';

// Portable exports (CSV for spreadsheets, JSON as a full dump) — available in both shells.
// The browser downloads a Blob; the desktop app routes through the save dialog + a plain
// Rust write command (a Blob anchor download can no-op inside the webview).
const isTauri = typeof window !== 'undefined' && (window as { isTauri?: boolean }).isTauri === true;

async function saveViaTauri(defaultName: string, ext: string, contents: string): Promise<void> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const dest = await save({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (typeof dest !== 'string') return;
  await invoke('save_text_file', { destPath: dest, contents });
}

function downloadInBrowser(name: string, mime: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportData({ data }: { data: LedgerData }) {
  const [busy, setBusy] = useState<null | 'csv' | 'json'>(null);

  const onExport = async (kind: 'csv' | 'json') => {
    const name = `budget-export-${todayISO()}.${kind}`;
    const contents = kind === 'csv' ? buildCsvExport(data) : buildJsonExport(data, new Date().toISOString());
    setBusy(kind);
    try {
      if (isTauri) await saveViaTauri(name, kind, contents);
      else downloadInBrowser(name, kind === 'csv' ? 'text/csv' : 'application/json', contents);
    } catch (e) {
      window.alert(`Export failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-ink">Export</h3>
      <p className="mb-3 text-xs text-ink-faint">
        Take your data with you. <strong>CSV</strong> is one spreadsheet-ready row per entry, list item, and
        delivery fee; <strong>JSON</strong> is a full structured dump (taxonomy, entries, lists, income, views).
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void onExport('csv')}
          disabled={busy !== null}
          className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {busy === 'csv' ? 'Exporting…' : 'Export CSV…'}
        </button>
        <button
          type="button"
          onClick={() => void onExport('json')}
          disabled={busy !== null}
          className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {busy === 'json' ? 'Exporting…' : 'Export JSON…'}
        </button>
      </div>
    </div>
  );
}
