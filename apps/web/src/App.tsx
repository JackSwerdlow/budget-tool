import { useEffect, useState } from 'react';
import { fetchBootstrap } from './api';
import type { Bootstrap, Category, Group } from './types';

type Tab = 'overview' | 'add' | 'manage';
type OverviewView = 'month' | 'trends';
type AddView = 'single' | 'list';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'add', label: '+ Add' },
  { id: 'manage', label: '⚙ Manage' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overviewView, setOverviewView] = useState<OverviewView>('month');
  const [addView, setAddView] = useState<AddView>('single');
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBootstrap()
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6">
      <header className="flex items-baseline justify-between border-b border-hairline pb-4 pt-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">Ledger</h1>
          <p className="mt-1 text-sm text-ink-muted">A personal budget account book</p>
        </div>
        <span className="font-serif text-sm text-ink-faint">June 2026</span>
      </header>

      <nav className="flex gap-1 border-b border-hairline">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                'relative -mb-px px-4 py-3 text-sm transition-colors ' +
                (active
                  ? 'font-medium text-accent'
                  : 'text-ink-muted hover:text-ink')
              }
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 py-8">
        {error && (
          <Panel>
            <p className="text-over">Could not reach the API: {error}</p>
            <p className="mt-1 text-sm text-ink-muted">
              Is it running? Start both with <Code>npm run dev</Code>.
            </p>
          </Panel>
        )}

        {!error && tab === 'overview' && (
          <Section>
            <Segmented
              value={overviewView}
              onChange={setOverviewView}
              options={[
                { id: 'month', label: 'Month' },
                { id: 'trends', label: 'Trends' },
              ]}
            />
            {overviewView === 'month' ? <OverviewMonth data={data} /> : <Stub title="Trends matrix" phase="Phase 3" />}
          </Section>
        )}

        {!error && tab === 'add' && (
          <Section>
            <Segmented
              value={addView}
              onChange={setAddView}
              options={[
                { id: 'single', label: 'Single' },
                { id: 'list', label: 'List' },
              ]}
            />
            {addView === 'single' ? (
              <Stub title="Add a single entry" phase="Phase 1" />
            ) : (
              <Stub title="Add an itemised list" phase="Phase 2" />
            )}
          </Section>
        )}

        {!error && tab === 'manage' && (
          <Section>
            <Stub title="Manage entries, taxonomy & income" phase="Phase 4" />
          </Section>
        )}
      </main>

      <footer className="border-t border-hairline py-4 text-xs text-ink-faint">
        Phase 0 scaffold · data lives in a local SQLite file
      </footer>
    </div>
  );
}

function OverviewMonth({ data }: { data: Bootstrap | null }) {
  if (!data) return <Panel>Loading the ledger…</Panel>;

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <Stat label="Groups" value={data.groups.length} />
          <Stat label="Categories" value={data.categories.length} />
          <Stat label="Entries" value={data.entries.length} />
          <Stat label="Lists" value={data.lists.length} />
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Connected to the API and the seeded taxonomy. Totals, charts and comparisons arrive in
          the next phases.
        </p>
      </Panel>

      <Taxonomy groups={data.groups} categories={data.categories} />
    </div>
  );
}

function Taxonomy({ groups, categories }: { groups: Group[]; categories: Category[] }) {
  return (
    <div>
      <h2 className="font-serif text-lg text-ink">Category taxonomy</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <div
            key={group.id}
            className="rounded-lg border border-hairline bg-panel p-4"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              <h3 className="font-serif text-base text-ink">{group.name}</h3>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {categories
                .filter((c) => c.group_id === group.id)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm text-ink">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                    {c.exclude_from_discretionary === 1 && (
                      <span className="ml-1 rounded bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                        ex-discretionary
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="mb-6 inline-flex rounded-lg border border-hairline bg-raised p-0.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={
              'rounded-md px-4 py-1.5 text-sm transition-colors ' +
              (active ? 'bg-panel font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-hairline bg-panel p-5">{children}</div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-serif text-3xl text-ink">{value}</div>
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}

function Stub({ title, phase }: { title: string; phase: string }) {
  return (
    <Panel>
      <h2 className="font-serif text-lg text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Coming in <span className="text-ink">{phase}</span>.
      </p>
    </Panel>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}
