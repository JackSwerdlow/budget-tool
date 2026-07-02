import { useEffect, useState } from 'react';
import { nextMonth, previousMonth } from '@budget/core';
import { createView } from './api';
import { useData } from './data';
import { fullDate, todayISO } from './lib/dates';
import { Code, Kbd, MonthPicker, Panel, Segmented } from './components/ui';
import { AddSingle } from './features/AddSingle';
import { AddList } from './features/AddList';
import { OverviewMonth } from './features/OverviewMonth';
import { Manage } from './features/manage/Manage';
import { Salary } from './features/salary/Salary';
import { TrendsMatrix } from './charts/TrendsMatrix';
import { CategoryVisibilityPanel } from './components/CategoryVisibilityPanel';

type Tab = 'overview' | 'add' | 'manage' | 'salary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'add', label: '+ Add' },
  { id: 'salary', label: 'Salary' },
  { id: 'manage', label: '⚙ Manage' },
];

// Mirrors the cap enforced by both data layers (repo.ts / queries.ts) and Manage → Views.
const MAX_VIEWS = 4;

export function App() {
  const { data, error, loading, refresh } = useData();
  const [tab, setTab] = useState<Tab>('overview');
  const [overviewView, setOverviewView] = useState<'month' | 'trends'>('month');
  const [addView, setAddView] = useState<'single' | 'list'>('single');
  const [ym, setYm] = useState<string>(todayISO().slice(0, 7));
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<number>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  // A button is "active" when the live filter exactly matches its target set — not tracked
  // state, so it naturally clears once the Categories checklist diverges from the preset.
  const isActiveFilter = (ids: number[]) =>
    ids.length === hiddenCategoryIds.size && ids.every((id) => hiddenCategoryIds.has(id));

  const onSaveView = async () => {
    const name = viewName.trim();
    if (!name) return;
    await createView({ name, hidden_category_ids: [...hiddenCategoryIds] });
    await refresh();
    setSaveViewOpen(false);
    setViewName('');
  };

  const lastEntryDate = data
    ? ([...data.entries.map((e) => e.date), ...data.lists.map((l) => l.date)].sort().at(-1) ?? null)
    : null;

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
      } else if (e.key === 's') {
        e.preventDefault();
        setTab('salary');
      } else if (e.key === 'ArrowLeft') {
        if ((tab === 'overview' && overviewView === 'month') || tab === 'salary' || tab === 'manage') {
          e.preventDefault();
          setYm((prev) => previousMonth(prev));
        }
      } else if (e.key === 'ArrowRight') {
        if ((tab === 'overview' && overviewView === 'month') || tab === 'salary' || tab === 'manage') {
          e.preventDefault();
          setYm((prev) => nextMonth(prev));
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tab, overviewView]);

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-y-2 border-b border-hairline pb-4 pt-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">Budget Tool</h1>
          <p className="mt-1 text-sm text-ink-muted">An app to track monthly spending and trends</p>
        </div>
        <div className="text-right">
          <div className="font-serif text-sm text-ink-faint">{fullDate(todayISO())}</div>
          {lastEntryDate && (
            <div className="mt-0.5 text-xs text-ink-faint">last entry · {fullDate(lastEntryDate)}</div>
          )}
        </div>
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
              <div className="flex items-center gap-3">
                <Segmented
                  value={overviewView}
                  onChange={setOverviewView}
                  options={[
                    { id: 'month', label: 'Month' },
                    { id: 'trends', label: 'Trends' },
                  ]}
                />
                {data.views.length > 0 && (
                  <div className="inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-raised p-0.5">
                    <button
                      type="button"
                      onClick={() => setHiddenCategoryIds(new Set())}
                      className={`rounded-md px-3 py-1 text-xs transition-colors ${
                        isActiveFilter([]) ? 'bg-panel font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      All
                    </button>
                    {data.views.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setHiddenCategoryIds(new Set(v.hidden_category_ids))}
                        className={`rounded-md px-3 py-1 text-xs transition-colors ${
                          isActiveFilter(v.hidden_category_ids) ? 'bg-panel font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  aria-expanded={showFilter}
                  className={`text-xs transition-colors hover:text-accent ${hiddenCategoryIds.size > 0 ? 'text-accent' : 'text-ink-muted'}`}
                  onClick={() => setShowFilter((s) => !s)}
                >
                  Categories {showFilter ? '▴' : '▾'}
                </button>
                {hiddenCategoryIds.size > 0 &&
                  data.views.length < MAX_VIEWS &&
                  !data.views.some((v) => isActiveFilter(v.hidden_category_ids)) &&
                  (saveViewOpen ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void onSaveView();
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        autoFocus
                        value={viewName}
                        onChange={(e) => setViewName(e.target.value)}
                        placeholder="View name"
                        className="w-28 rounded-md border border-hairline bg-paper px-2 py-1 text-xs text-ink outline-none focus:border-ink/40"
                      />
                      <button type="submit" disabled={viewName.trim() === ''} className="text-xs text-accent disabled:cursor-not-allowed disabled:opacity-40">
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSaveViewOpen(false); setViewName(''); }}
                        className="text-xs text-ink-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSaveViewOpen(true)}
                      className="text-xs text-ink-muted transition-colors hover:text-accent"
                    >
                      save as View
                    </button>
                  ))}
              </div>
              {overviewView === 'month' && <MonthPicker ym={ym} onChange={setYm} />}
            </div>
            {showFilter && (
              <div className="mb-6">
                <CategoryVisibilityPanel data={data} hiddenCategoryIds={hiddenCategoryIds} onChange={setHiddenCategoryIds} />
              </div>
            )}
            {overviewView === 'month' ? (
              <OverviewMonth data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />
            ) : (
              <TrendsMatrix data={data} hiddenCategoryIds={hiddenCategoryIds} />
            )}
          </div>
        ) : tab === 'salary' ? (
          <Salary data={data} ym={ym} onYmChange={setYm} />
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
          <Manage data={data} ym={ym} onYmChange={setYm} />
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline py-4 text-xs text-ink-faint">
        <span>Budget Tool - <a href="https://github.com/JackSwerdlow/budget-tool">GitHub</a> - <a href="https://gam-jam-review.vercel.app/">GamJam Review Page</a></span>
        <span className="hidden items-center gap-2 sm:flex">
          <Kbd>a</Kbd> add
          <Kbd>o</Kbd> overview
          <Kbd>s</Kbd> salary
          <Kbd>m</Kbd> manage
          <Kbd>←</Kbd><Kbd>→</Kbd> month
        </span>
      </footer>
    </div>
  );
}
