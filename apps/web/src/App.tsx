import { useCallback, useEffect, useMemo, useState } from 'react';
import { nextMonth, previousMonth } from '@budget/core';
import { createView } from './api';
import { useData } from './data';
import { fullDate, todayISO } from './lib/dates';
import { useEscape } from './lib/useEscape';
import { Code, Kbd, MonthPicker, Panel } from './components/ui';
import { PinnedTabBar } from './components/PinnedTabBar';
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

// Sub-tab order — the pager's slide order, and what maps its index back to a view id.
const OVERVIEW_VIEWS = ['month', 'trends', 'items'] as const;
const ADD_VIEWS = ['single', 'list', 'monthly'] as const;

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

  // Every tab's sub-tabs are a swipeable pager (SubTabPager) under a shared PinnedTabBar.
  const onOverviewIndexChange = useCallback((i: number) => setOverviewView(OVERVIEW_VIEWS[i]), []);
  const onAddIndexChange = useCallback((i: number) => setAddView(ADD_VIEWS[i]), []);

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

  // Months with any recorded spend, for the range calendar to fade the empty ones. Month by
  // string slice, never `new Date` (see the ARCHITECTURE invariant). Deliberately ignores the
  // category filter: this says where data exists at all, not what's currently shown.
  const monthsWithSpend = useMemo(
    () => new Set([
      ...(data?.entries ?? []).map((e) => e.date.slice(0, 7)),
      ...(data?.lists ?? []).map((l) => l.date.slice(0, 7)),
    ]),
    [data],
  );

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
      {/* No padding of its own on a phone: each tab's control bar butts up under the title row,
          and the pager's panels carry their own inset so it scrolls away with the content. The
          panels own the scrolling, so this never scrolls itself. */}
      <main className="flex min-h-0 flex-1 flex-col py-8 max-sm:overflow-hidden max-sm:py-0">
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
            <PinnedTabBar
              value={overviewView}
              onChange={setOverviewView}
              options={[
                { id: 'month', label: 'Month' },
                { id: 'trends', label: 'Trends' },
                { id: 'items', label: 'Items' },
              ]}
              // Both sub-tab controls share row one's right slot: the month stepper on Month, the
              // month-range calendar on Trends (Items has no range of its own).
              right={
                overviewView === 'month' ? (
                  <MonthPicker ym={ym} onChange={setYm} />
                ) : overviewView === 'trends' ? (
                  <TrendsRangePicker
                    displayStart={trendsDisplayStart}
                    displayEnd={trendsDisplayEnd}
                    isCustomRange={trendsIsCustomRange}
                    monthsWithSpend={monthsWithSpend}
                    onRangeStart={setTrendsRangeStart}
                    onRangeEnd={setTrendsRangeEnd}
                    onResetRange={() => { setTrendsRangeStart(null); setTrendsRangeEnd(null); }}
                  />
                ) : undefined
              }
              below={
                // Inside the bar so it opens attached to the controls it filters.
                showFilter ? (
                  <div className="mt-1 w-full">
                    <CategoryVisibilityPanel data={data} hiddenCategoryIds={hiddenCategoryIds} onChange={setHiddenCategoryIds} />
                  </div>
                ) : undefined
              }
              secondRow={
                <>
                {data.views.length > 0 && (
                  // A segmented row that must not wrap — a preset pushed onto a second line moved
                  // the panels below it. So it budgets the width it has instead: the selected
                  // preset always shows its whole name and never gives up width, the others shrink
                  // and truncate ("Groc…"), and every name is capped so one long one can't take
                  // the row. "All" is a fixed label short enough to never need any of it. The cap
                  // is the tight phone one; from sm up it's generous, since a name has no business
                  // being clipped in a row with hundreds of spare pixels.
                  // Hidden on a phone while the save-as-View form is open: the form is ~200px of
                  // the row, and no preset is active in the state that offers it anyway.
                  <div className={`min-w-0 items-center gap-0.5 rounded-lg border border-hairline bg-raised p-0.5 ${saveViewOpen ? 'hidden sm:flex' : 'flex'}`}>
                    <button
                      type="button"
                      onClick={() => setHiddenCategoryIds(new Set())}
                      className={`shrink-0 rounded-md px-3 py-1 text-xs transition-colors ${
                        isActiveFilter([]) ? 'bg-panel font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      All
                    </button>
                    {data.views.map((v) => {
                      const active = isActiveFilter(v.hidden_category_ids);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setHiddenCategoryIds(new Set(v.hidden_category_ids))}
                          title={v.name}
                          className={`max-w-32 truncate rounded-md px-3 py-1 text-xs transition-colors sm:max-w-64 ${
                            active
                              ? 'shrink-0 bg-panel font-medium text-ink shadow-sm'
                              : 'min-w-0 flex-auto text-ink-muted hover:text-ink'
                          }`}
                        >
                          {v.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
                </>
              }
            />
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
          <div className="flex min-h-0 flex-1 flex-col">
            <PinnedTabBar
              value={addView}
              onChange={setAddView}
              options={[
                { id: 'single', label: 'Single' },
                { id: 'list', label: 'List' },
                { id: 'monthly', label: 'Monthly' },
              ]}
            />
            <SubTabPager index={ADD_VIEWS.indexOf(addView)} onIndexChange={onAddIndexChange}>
              {[
                <AddSingle key="single" data={data} />,
                <AddList key="list" data={data} />,
                <AddMonthly key="monthly" data={data} />,
              ]}
            </SubTabPager>
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
