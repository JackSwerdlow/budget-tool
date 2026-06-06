import { useEffect, useState } from 'react';
import { useData } from './data';
import { monthLabel, todayISO } from './lib/dates';
import { Code, Kbd, MonthPicker, Panel, Segmented } from './components/ui';
import { AddSingle } from './features/AddSingle';
import { AddList } from './features/AddList';
import { OverviewMonth } from './features/OverviewMonth';
import { Manage } from './features/manage/Manage';
import { TrendsMatrix } from './charts/TrendsMatrix';

type Tab = 'overview' | 'add' | 'manage';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'add', label: '+ Add' },
  { id: 'manage', label: '⚙ Manage' },
];

export function App() {
  const { data, error, loading } = useData();
  const [tab, setTab] = useState<Tab>('overview');
  const [overviewView, setOverviewView] = useState<'month' | 'trends'>('month');
  const [addView, setAddView] = useState<'single' | 'list'>('single');
  const [ym, setYm] = useState<string>(todayISO().slice(0, 7));

  // Global hotkeys — adding is never more than a keystroke (ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.key === 'a') {
        e.preventDefault(); // don't let the keystroke leak into the now-focused amount field
        setTab('add');
        setAddView('single');
      } else if (e.key === 'o') {
        e.preventDefault();
        setTab('overview');
      } else if (e.key === 'm') {
        e.preventDefault();
        setTab('manage');
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6">
      <header className="flex items-baseline justify-between border-b border-hairline pb-4 pt-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">Ledger</h1>
          <p className="mt-1 text-sm text-ink-muted">A personal budget account book</p>
        </div>
        <span className="font-serif text-sm text-ink-faint">{monthLabel(todayISO().slice(0, 7))}</span>
      </header>

      <nav className="flex gap-1 border-b border-hairline">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative -mb-px px-4 py-3 text-sm transition-colors ${
                active ? 'font-medium text-accent' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 py-8">
        {error ? (
          <Panel>
            <p className="text-over">Could not reach the API: {error}</p>
            <p className="mt-1 text-sm text-ink-muted">
              Is it running? Start both with <Code>npm run dev</Code>.
            </p>
          </Panel>
        ) : !data ? (
          <Panel>{loading ? 'Loading the ledger…' : 'No data.'}</Panel>
        ) : tab === 'overview' ? (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <Segmented
                value={overviewView}
                onChange={setOverviewView}
                options={[
                  { id: 'month', label: 'Month' },
                  { id: 'trends', label: 'Trends' },
                ]}
              />
              {overviewView === 'month' && <MonthPicker ym={ym} onChange={setYm} />}
            </div>
            {overviewView === 'month' ? (
              <OverviewMonth data={data} ym={ym} />
            ) : (
              <TrendsMatrix data={data} />
            )}
          </div>
        ) : tab === 'add' ? (
          <div>
            <div className="mb-6">
              <Segmented
                value={addView}
                onChange={setAddView}
                options={[
                  { id: 'single', label: 'Single' },
                  { id: 'list', label: 'List' },
                ]}
              />
            </div>
            {addView === 'single' ? <AddSingle data={data} /> : <AddList data={data} />}
          </div>
        ) : (
          <Manage data={data} />
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline py-4 text-xs text-ink-faint">
        <span>Ledger · a local, single-user budget book — everything updates live</span>
        <span className="flex items-center gap-2">
          <Kbd>a</Kbd> add
          <Kbd>o</Kbd> overview
          <Kbd>m</Kbd> manage
        </span>
      </footer>
    </div>
  );
}
