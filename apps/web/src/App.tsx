import { useState } from 'react';
import { useData } from './data';
import { monthLabel, todayISO } from './lib/dates';
import { Code, MonthPicker, Panel, Segmented, Stub } from './components/ui';
import { AddSingle } from './features/AddSingle';
import { OverviewMonth } from './features/OverviewMonth';

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
              <Stub title="Trends matrix" phase="Phase 3" />
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
            {addView === 'single' ? <AddSingle data={data} /> : <Stub title="Add an itemised list" phase="Phase 2" />}
          </div>
        ) : (
          <Stub title="Manage entries, taxonomy & income" phase="Phase 4" />
        )}
      </main>

      <footer className="border-t border-hairline py-4 text-xs text-ink-faint">
        Phase 1 · add an entry and watch the overview update live
      </footer>
    </div>
  );
}
