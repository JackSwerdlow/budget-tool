import type { DataPort } from './port';
import type { InvokeFn } from './queries';
import { httpPort } from './http';
import { makeSqlPort } from './queries';
import { normalizeError } from './errors';

// Inside the Tauri webview window.isTauri === true → use the SQL plugin adapter; in a plain
// browser (dev/web) → HTTP. Detection is the documented Tauri v2 global.
const isTauri = typeof window !== 'undefined' && (window as { isTauri?: boolean }).isTauri === true;

// Adapter construction is async (the Tauri executor must `Database.load`), so the active
// port is a promise and every call awaits it. The proxy below keeps the public surface a
// plain DataPort of named async functions while folding in error normalization.
const portPromise: Promise<DataPort> = (async () => {
  if (!isTauri) return httpPort;
  const { tauriExecutor } = await import('./executor');
  const { invoke } = await import('@tauri-apps/api/core');
  return makeSqlPort(await tauriExecutor(), invoke as InvokeFn);
})();

function lazyPort(): DataPort {
  return new Proxy({} as DataPort, {
    get(_target, key) {
      return (...args: unknown[]) =>
        portPromise
          .then((p) => (p[key as keyof DataPort] as (...a: unknown[]) => Promise<unknown>)(...args))
          .catch((e) => {
            throw normalizeError(e);
          });
    },
  });
}

export const dataPort = lazyPort();

export const {
  fetchBootstrap, createEntry, updateEntry, deleteEntry, createList, updateList, deleteList,
  createCategory, updateCategory, deleteCategory, createGroup, updateGroup, deleteGroup,
  reorderGroups, reorderCategories, setIncome, deleteIncome, setDefaultIncome,
  clearDefaultIncome, getSalaryConfig, getSalaryYTD, saveSalaryConfig, deleteSalaryConfig,
  getAllSalaryConfigs, createView, updateView, deleteView,
  createRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate,
  confirmRecurring, skipRecurring, unskipRecurring,
} = dataPort;
