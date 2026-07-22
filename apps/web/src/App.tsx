import { useCallback, useEffect, useState } from 'react';
import { nextMonth, previousMonth } from '@budget/core';
import { createView } from './api';
import { useData } from './data';
import { fullDate, todayISO } from './lib/dates';
import { useEscape } from './lib/useEscape';
import { useSwipeNav } from './lib/useSwipeNav';
import { Code, Kbd, MonthPicker, Panel, Segmented } from './components/ui';
import { SubTabPager } from './components/SubTabPager';
import { AddSingle } from './features/AddSingle';
import { AddList } from './features/AddList';
import { AddMonthly } from './features/AddMonthly';
import { OverviewMonth } from './features/OverviewMonth';
import { Manage } from './features/manage/Manage';
import { Salary } from './features/salary/Salary';
import { OverviewTrends } from './features/OverviewTrends';
import { TrendsRangePicker } from './features/TrendsRangePicker';
import { OverviewItems } from './features/OverviewItems';
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

// Sub-tab order for touch swipe navigation (see useSwipeNav). Clamped at the ends.
const OVERVIEW_VIEWS = ['month', 'trends', 'items'] as const;
const ADD_VIEWS = ['single', 'list', 'monthly'] as const;
function stepView<const T extends readonly string[]>(views: T, current: T[number], dir: 1 | -1): T[number] {
  const i = views.indexOf(current);
  return views[Math.min(views.length - 1, Math.max(0, i + dir))];
}

export function App() {
  const { data, error, loading, refresh } = useData();
  const [tab, setTab] = useState<Tab>('overview');
  const [overviewView, setOverviewView] = useState<'month' | 'trends' | 'items'>('month');
  const [addView, setAddView] = useState<'single' | 'list' | 'monthly'>('single');
  const [ym, setYm] = useState<string>(todayISO().slice(0, 7));
  const [trendsRangeStart, setTrendsRangeStart] = useState<string | null>(null);
  const [trendsRangeEnd, setTrendsRangeEnd] = useState<string | null>(null);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<number>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  // Overview's sub-tabs are a swipeable pager (SubTabPager); Add still uses the older detector
  // until the pattern is proven there — its forms hold state that mounting all three would change.
  const onOverviewIndexChange = useCallback((i: number) => setOverviewView(OVERVIEW_VIEWS[i]), []);
  const addSwipe = useSwipeNav(
    () => setAddView((v) => stepView(ADD_VIEWS, v, -1)),
    () => setAddView((v) => stepView(ADD_VIEWS, v, 1)),
  );

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

  // The Trends range picker lives in the header (below) rather than above the matrix, since
  // it drives all three Trends charts. Default: the 6 months ending this month.
  const trendsCurrentYm = todayISO().slice(0, 7);
  let trendsDefaultStart = trendsCurrentYm;
  for (let i = 0; i < 5; i++) trendsDefaultStart = previousMonth(trendsDefaultStart);
  const trendsDisplayStart = trendsRangeStart ?? trendsDefaultStart;
  const trendsDisplayEnd = trendsRangeEnd ?? trendsCurrentYm;
  const trendsIsCustomRange = trendsRangeStart !== null || trendsRangeEnd !== null;

  // Escape dismisses the transient Overview panels (filter checklist, save-as-View form).
  useEscape(() => {
    setShowFilter(false);
    setSaveViewOpen(false);
    setViewName('');
  }, showFilter || saveViewOpen);

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
    // On a phone this is a fixed-height column: header and control bar sit still and the panel
    // area below scrolls internally (see SubTabPager). From sm up it goes back to an ordinary
    // page that scrolls as a whole.
    <div className="mx-auto flex h-full max-w-5xl flex-col px-3 sm:h-auto sm:min-h-full sm:px-6">
      {/* Deliberately NOT collapse-on-scroll. This sits in the fixed region above a panel that
          scrolls, so hiding it made the panel taller, which clamped scrollTop, which read as a
          direction change, which showed it again — a feedback loop that bounced the bar. Pinning
          it removes the loop at the source. It's compact enough on a phone to afford the space:
          a smaller title, no tagline, and the two dates stacked to fit the title's own height. */}
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-y-2 max-sm:items-center max-sm:pb-1 max-sm:pt-2 sm:border-b sm:border-hairline sm:pb-4 sm:pt-8">
        <div>
          <h1 className="font-serif text-xl font-semibold tracking-tight text-ink sm:text-3xl">Budget Tool</h1>
          <p className="mt-1 hidden text-sm text-ink-muted sm:block">An app to track monthly spending and trends</p>
        </div>
        <div className="text-right leading-tight">
          <div className="font-serif text-[11px] text-ink-faint sm:text-sm">{fullDate(todayISO())}</div>
          {lastEntryDate && (
            <div className="text-[11px] text-ink-faint sm:mt-0.5 sm:text-xs">last entry · {fullDate(lastEntryDate)}</div>
          )}
        </div>
      </header>

      {/* One nav, two renderings: fixed bottom tab bar on phones, top tabs from sm up. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-hairline bg-panel pb-[env(safe-area-inset-bottom)] sm:static sm:flex sm:gap-1 sm:border-b sm:border-t-0 sm:bg-transparent sm:pb-0">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative px-1 py-3 text-sm transition-colors sm:-mb-px sm:px-4 ${
                active ? 'font-medium text-accent' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent sm:inset-x-2 sm:top-auto sm:-bottom-px" />
              )}
            </button>
          );
        })}
      </nav>

      {/* On a phone Overview hands scrolling to its pager panels (each keeps its own position);
          every other tab scrolls here instead. Desktop scrolls the page as a whole. */}
      <main
        className={`flex min-h-0 flex-1 flex-col py-8 ${
          tab === 'overview'
            // No padding of its own on a phone: the control bar butts up under the title row, and
            // the panels carry their own inset so it scrolls away with the content.
            ? 'max-sm:overflow-hidden max-sm:py-0'
            : 'max-sm:overflow-y-auto max-sm:py-4'
        }`}
      >
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
          <div className="flex min-h-0 flex-1 flex-col">
            {/* The control bar stays put while the panels scroll under it, so the sub-tabs are
                always reachable — only the title above it collapses (Material pins the tab row of
                a collapsing toolbar for the same reason). The -mx/px pair bleeds the paper
                background over the container's gutter. Plain header row from sm up. */}
            {/* On a phone the pinned region ends exactly on this bar's bottom border — no margin
                under it. The panels below start their scroll right at the line. */}
            <div className="-mx-3 shrink-0 border-b border-hairline bg-paper px-3 max-sm:pb-1.5 max-sm:pt-1 sm:mx-0 sm:mb-6 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              {/* Row one is a two-slot flex row that cannot wrap: sub-tabs left, month control
                  hard against the right. Previously everything shared one `flex-wrap` row, so the
                  left group filled it at ~360px and pushed the month picker onto a second line. */}
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="min-w-0 shrink">
                  <Segmented
                    value={overviewView}
                    onChange={setOverviewView}
                    options={[
                      { id: 'month', label: 'Month' },
                      { id: 'trends', label: 'Trends' },
                      { id: 'items', label: 'Items' },
                    ]}
                  />
                </div>
                {overviewView === 'month' && (
                  <div className="shrink-0">
                    <MonthPicker ym={ym} onChange={setYm} />
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:mt-2 sm:gap-3">
                {data.views.length > 0 && (
                  <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-hairline bg-raised p-0.5">
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
                {overviewView === 'trends' && (
                  <TrendsRangePicker
                    displayStart={trendsDisplayStart}
                    displayEnd={trendsDisplayEnd}
                    isCustomRange={trendsIsCustomRange}
                    onRangeStart={setTrendsRangeStart}
                    onRangeEnd={setTrendsRangeEnd}
                    onResetRange={() => { setTrendsRangeStart(null); setTrendsRangeEnd(null); }}
                  />
                )}
              </div>
              {/* Inside the control bar so it opens attached to the controls it filters. */}
              {showFilter && (
                <div className="mt-1 w-full">
                  <CategoryVisibilityPanel data={data} hiddenCategoryIds={hiddenCategoryIds} onChange={setHiddenCategoryIds} />
                </div>
              )}
            </div>
            <SubTabPager index={OVERVIEW_VIEWS.indexOf(overviewView)} onIndexChange={onOverviewIndexChange}>
              {[
                <OverviewMonth key="month" data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />,
                <OverviewTrends
                  key="trends"
                  data={data}
                  hiddenCategoryIds={hiddenCategoryIds}
                  displayStart={trendsDisplayStart}
                  displayEnd={trendsDisplayEnd}
                  onOpenMonth={(m) => {
                    setYm(m);
                    setOverviewView('month');
                  }}
                />,
                <OverviewItems key="items" data={data} hiddenCategoryIds={hiddenCategoryIds} />,
              ]}
            </SubTabPager>
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
                  { id: 'monthly', label: 'Monthly' },
                ]}
              />
            </div>
            <div {...addSwipe}>
              {addView === 'single' ? (
                <AddSingle data={data} />
              ) : addView === 'list' ? (
                <AddList data={data} />
              ) : (
                <AddMonthly data={data} />
              )}
            </div>
          </div>
        ) : (
          <Manage data={data} ym={ym} onYmChange={setYm} />
        )}
      </main>

      {/* Hidden on a phone: the shell is a fixed-height column there, so a footer would sit
          permanently above the bottom tab bar rather than scrolling away with the content. */}
      <footer className="mb-16 hidden flex-wrap items-center justify-between gap-2 border-t border-hairline py-4 text-xs text-ink-faint sm:mb-0 sm:flex">
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
