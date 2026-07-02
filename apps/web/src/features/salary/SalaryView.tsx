import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { area, curveMonotoneX, line } from 'd3-shape';
import { formatGBP, type BreakdownLine, type LifetimeTotals, type SalaryView, type StudentLoanResult } from '@budget/core';
import { lifetimeLines, type LifetimeLine } from './lifetimeLines';
import { monthLabel } from '../../lib/dates';

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
              <th className={`${th} text-left`}>&nbsp;</th>
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
              <th className={`${th} text-left`}>&nbsp;</th>
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
          <dt className="text-ink-muted">Income tax <span className="text-ink-faint">· of gross</span></dt>
          <dd className="tabular-nums text-ink">{pct(stats.incomeTaxRateGross)}</dd>
        </div>
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">Income tax <span className="text-ink-faint">· of taxable</span></dt>
          <dd className="tabular-nums text-ink">{pct(stats.incomeTaxRateTaxable)}</dd>
        </div>
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">Total deductions <span className="text-ink-faint">· of gross</span></dt>
          <dd className="tabular-nums text-ink">{pct(stats.totalRate)}</dd>
        </div>
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">… incl. employer pension</dt>
          <dd className="tabular-nums text-ink">{pct(stats.totalRateInclPension)}</dd>
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

export function KeyFigures({ stats, pensionFundPence, studentDebtPence, ymLabel }: {
  stats: SalaryView['stats'];
  pensionFundPence: number | null;
  studentDebtPence: number | null;
  ymLabel: string;
}) {
  const row = (label: ReactNode, value: string) => (
    <div className="flex justify-between border-b border-hairline py-1">
      <dt className="text-ink-muted">{label}</dt><dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
  return (
    <section className="rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">
        Key figures <span className="font-normal text-ink-faint text-sm">— as of {ymLabel}</span>
      </h2>
      <dl className="space-y-1 text-sm">
        <div className="text-xs uppercase tracking-wide text-ink-faint pt-1">Effective rates</div>
        {row(<>Income tax <span className="text-ink-faint">· of gross</span></>, pct(stats.incomeTaxRateGross))}
        {row(<>Income tax <span className="text-ink-faint">· of taxable</span></>, pct(stats.incomeTaxRateTaxable))}
        {row(<>Total deductions <span className="text-ink-faint">· of gross</span></>, pct(stats.totalRate))}
        {row(<>… incl. employer pension</>, pct(stats.totalRateInclPension))}
        <div className="text-xs uppercase tracking-wide text-ink-faint pt-2">Position (cumulative to date)</div>
        {row('Total pension fund', pensionFundPence == null ? '—' : formatGBP(pensionFundPence))}
        {row('Remaining student debt', studentDebtPence == null ? '—' : formatGBP(studentDebtPence))}
      </dl>
    </section>
  );
}

function LifetimeRow({ line, byKey, open, toggle }: {
  line: LifetimeLine;
  byKey: Map<string, LifetimeLine>;
  open: Record<string, boolean>;
  toggle: (k: string) => void;
}) {
  // Visibility: all ancestors must be open
  let p = line.parent;
  while (p) {
    if (!(open[p] ?? false)) return null;
    p = byKey.get(p)?.parent;
  }

  const isGroup = !!line.group;
  const isOpen = open[line.key] ?? false;
  const pad = (['pr-4', 'pl-4 pr-4', 'pl-8 pr-4'] as const)[line.depth] ?? 'pr-4';
  const tone =
    line.tone === 'net' ? 'text-accent' :
    line.tone === 'deduction' || line.tone === 'muted' ? 'text-ink-muted' :
    'text-ink';
  const weight = line.depth === 0 ? 'font-medium' : '';
  const interactive = isGroup ? 'group cursor-pointer hover:bg-raised/60' : '';

  return (
    <tr
      className={`border-b border-hairline ${tone} ${weight} ${interactive}`}
      onClick={isGroup ? () => toggle(line.key) : undefined}
      role={isGroup ? 'button' : undefined}
      tabIndex={isGroup ? 0 : undefined}
      aria-expanded={isGroup ? isOpen : undefined}
      onKeyDown={
        isGroup
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
          <span className={`inline-block w-3 text-center text-ink-faint ${isGroup ? 'group-hover:text-accent' : ''}`}>
            {isGroup ? (isOpen ? '▾' : '▸') : ''}
          </span>
          <span className={isGroup ? 'group-hover:text-accent' : ''}>{line.label}</span>
        </span>
      </td>
      <td className={td}>{formatGBP(line.pence)}</td>
    </tr>
  );
}

export function StudentLoanTracker({ result, ymLabel }: {
  result: StudentLoanResult; ymLabel: string;
}) {
  const row = (label: string, value: string) => (
    <div className="flex justify-between border-b border-hairline py-1">
      <dt className="text-ink-muted">{label}</dt><dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
  const payoff = result.payoff
    ? monthLabel(`${result.payoff.year}-${String(result.payoff.month).padStart(2, '0')}`)
      + (result.payoff.remainingInterestPence > 0 ? ` · ${formatGBP(result.payoff.remainingInterestPence)} interest left` : '')
    : '—';
  return (
    <section className="rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">
        Student Loan tracker <span className="font-normal text-ink-faint text-sm">— as of {ymLabel}</span>
      </h2>
      <dl className="space-y-1 text-sm">
        {row('Remaining balance', formatGBP(result.remainingBalancePence))}
        {row('Total interest accrued', formatGBP(result.totalInterestPence))}
        {row('Total paid toward balance', formatGBP(result.totalPaidTowardBalancePence))}
        {row('Projected payoff', payoff)}
      </dl>
      <BalanceSparkline series={result.series} />
    </section>
  );
}

// Per-month balance sparkline for the tracker. The walk's series starts at the first-ever
// config, so months before the "Set balance" anchor are a flat £0 lead-in — trimmed here.
// Hovering shows a crosshair and swaps the strip below to that month's balance and its
// change vs the previous month (up = red, down = green — a growing loan is the bad case).
function BalanceSparkline({ series }: { series: StudentLoanResult['series'] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const startIdx = series.findIndex((p) => p.balancePence > 0);
  const pts = startIdx === -1 ? [] : series.slice(startIdx);
  if (pts.length < 2) return null;

  const W = 640, H = 64, PAD = 5;
  // The y-axis spans min→max, not 0→max: against a £40k+ balance a £60 monthly payment is
  // invisible on a zero-based scale, and the movement is the whole point of the sparkline.
  const max = Math.max(...pts.map((p) => p.balancePence));
  const min = Math.min(...pts.map((p) => p.balancePence));
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);

  type Pt = { i: number; v: number };
  const data: Pt[] = pts.map((p, i) => ({ i, v: p.balancePence }));
  const linePath = line<Pt>().x((d) => x(d.i)).y((d) => y(d.v)).curve(curveMonotoneX)(data) ?? '';
  const areaPath = area<Pt>().x((d) => x(d.i)).y0(H - PAD).y1((d) => y(d.v)).curve(curveMonotoneX)(data) ?? '';

  const onMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((svgX - PAD) / (W - 2 * PAD)) * (pts.length - 1));
    setHoverIdx(Math.max(0, Math.min(i, pts.length - 1)));
  };

  const ymLabelOf = (p: StudentLoanResult['series'][number]) =>
    monthLabel(`${p.year}-${String(p.month).padStart(2, '0')}`);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const hovered = hoverIdx !== null ? pts[hoverIdx] : null;
  const hoverDelta = hoverIdx !== null && hoverIdx > 0 ? pts[hoverIdx].balancePence - pts[hoverIdx - 1].balancePence : null;

  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Student-loan balance by month">
        <path d={areaPath} className="fill-accent/10" />
        <path d={linePath} className="stroke-accent" strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {hoverIdx !== null && hovered ? (
          <>
            <line x1={x(hoverIdx)} y1={PAD} x2={x(hoverIdx)} y2={H - PAD} className="stroke-ink/20" strokeWidth={1} />
            <circle cx={x(hoverIdx)} cy={y(hovered.balancePence)} r={3.5} className="fill-accent" stroke="var(--color-panel)" strokeWidth={1.5} />
          </>
        ) : (
          <circle cx={x(data.length - 1)} cy={y(last.balancePence)} r={3} className="fill-accent" />
        )}
        <rect x={0} y={0} width={W} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)} />
      </svg>
      {hovered ? (
        <div className="mt-1 flex justify-between text-[10px]">
          <span className="text-ink-muted">
            {ymLabelOf(hovered)} · <span className="tabular-nums text-ink">{formatGBP(hovered.balancePence)}</span>
          </span>
          <span className={`tabular-nums ${hoverDelta === null || hoverDelta === 0 ? 'text-ink-faint' : hoverDelta > 0 ? 'text-over' : 'text-under'}`}>
            {hoverDelta === null ? '—' : `${hoverDelta > 0 ? '+' : ''}${formatGBP(hoverDelta)} vs prev month`}
          </span>
        </div>
      ) : (
        <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
          <span>{ymLabelOf(first)} · {formatGBP(first.balancePence)}</span>
          <span>{ymLabelOf(last)} · {formatGBP(last.balancePence)}</span>
        </div>
      )}
    </div>
  );
}

export function LifetimeTotalsTable({ totals }: { totals: LifetimeTotals }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !(o[k] ?? false) }));
  const lines = lifetimeLines(totals);
  const byKey = new Map(lines.map((l) => [l.key, l]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className={`${th} text-left`}>&nbsp;</th>
            <th className={th}>To date</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <LifetimeRow key={l.key} line={l} byKey={byKey} open={open} toggle={toggle} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
