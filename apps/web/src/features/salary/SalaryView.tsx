import { useState } from 'react';
import { formatGBP, type BreakdownLine, type SalaryView } from '@budget/core';

const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
const cell = (v: number | null) => (v == null ? '—' : formatGBP(v));

const th = 'pb-2 text-right text-xs font-normal uppercase tracking-wide text-ink-faint';
const td = 'py-1.5 text-right tabular-nums';

export function RateStrip({ rows }: { rows: SalaryView['rateStrip'] }) {
  return (
    <section className="rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">Rate</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${th} text-left`}>Rate</th>
              {['Yearly', 'Monthly', 'Weekly', 'Daily', 'Hourly', '% Gross'].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-hairline text-ink">
                <td className="py-1.5 pr-4">{r.label}</td>
                <td className={td}>{formatGBP(r.yearly)}</td>
                <td className={td}>{formatGBP(r.monthly)}</td>
                <td className={td}>{formatGBP(r.weekly)}</td>
                <td className={td}>{formatGBP(r.daily)}</td>
                <td className={td}>{formatGBP(r.hourly)}</td>
                <td className={td}>{pct(r.pctGross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ line, open, toggle }: {
  line: BreakdownLine;
  open: Record<string, boolean>;
  toggle: (k: string) => void;
}) {
  const hasChildren = !!line.children?.length;
  const isOpen = open[line.key] ?? false; // collapsed by default
  const pad = ['pr-4', 'pl-4 pr-4', 'pl-8 pr-4', 'pl-12 pr-4'][line.depth] ?? 'pr-4';
  const tone = line.isNet ? 'text-accent' : line.isDeduction || line.muted ? 'text-ink-muted' : 'text-ink';
  const weight = line.depth === 0 ? 'font-medium' : '';
  const interactive = hasChildren ? 'group cursor-pointer hover:bg-raised/60' : '';
  return (
    <>
      <tr
        className={`border-b border-hairline ${tone} ${weight} ${interactive}`}
        onClick={hasChildren ? () => toggle(line.key) : undefined}
        role={hasChildren ? 'button' : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
        onKeyDown={
          hasChildren
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(line.key);
                }
              }
            : undefined
        }
      >
        <td className={`py-1.5 ${pad}`}>
          <span className="inline-flex items-center gap-1">
            <span className={`inline-block w-3 text-center text-ink-faint ${hasChildren ? 'group-hover:text-accent' : ''}`}>
              {hasChildren ? (isOpen ? '▾' : '▸') : ''}
            </span>
            <span className={hasChildren ? 'group-hover:text-accent' : ''}>{line.label}</span>
          </span>
        </td>
        <td className={td}>{cell(line.cell.forecast)}</td>
        <td className={td}>{cell(line.cell.monthly)}</td>
        <td className={td}>{cell(line.cell.weekly)}</td>
        <td className={td}>{cell(line.cell.daily)}</td>
        <td className={td}>{cell(line.cell.hourly)}</td>
        <td className={td}>{cell(line.cell.ytd)}</td>
      </tr>
      {hasChildren && isOpen && line.children!.map((c) => (
        <Row key={c.key} line={c} open={open} toggle={toggle} />
      ))}
    </>
  );
}

export function BreakdownTable({ lines }: { lines: BreakdownLine[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !(o[k] ?? false) }));
  return (
    <section className="rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">Breakdown</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${th} text-left`}>Row</th>
              {['Yearly (fcast)', 'Monthly', 'Weekly', 'Daily', 'Hourly', 'YTD'].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => <Row key={l.key} line={l} open={open} toggle={toggle} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StatsPanel({ stats }: { stats: SalaryView['stats'] }) {
  return (
    <section className="flex-1 rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">Stats</h2>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">Effective tax + NI rate</dt>
          <dd className="tabular-nums text-ink">{pct(stats.effectiveRate)}</dd>
        </div>
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">… incl. employer pension</dt>
          <dd className="tabular-nums text-ink">{pct(stats.effectiveRateInclEmployerPension)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function PensionPanel({ rows }: { rows: SalaryView['pension'] }) {
  const showAllTime = rows.some((r) => r.allTime != null);
  return (
    <section className="flex-1 rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">Pension</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${th} text-left`}>&nbsp;</th>
              <th className={th}>Month</th>
              <th className={th}>Yearly</th>
              {showAllTime && <th className={th}>All-time</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-b border-hairline text-ink ${r.key === 'total' ? 'font-medium' : ''}`}>
                <td className="py-1.5 pr-4">{r.label}</td>
                <td className={td}>{formatGBP(r.month)}</td>
                <td className={td}>{formatGBP(r.yearlyForecast)}</td>
                {showAllTime && <td className={td}>{cell(r.allTime)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
