import { useCallback, useEffect, useMemo, useState } from 'react';
import { calcSalary, formatGBP, type LedgerData, type SalaryConfig } from '@budget/core';
import { deleteSalaryConfig, getSalaryConfig, saveSalaryConfig } from '../../api';
import { MonthPicker, Panel } from '../../components/ui';
import { useData } from '../../data';
import { monthLabel, todayISO } from '../../lib/dates';

// ── helpers ──────────────────────────────────────────────────────────────────

const currentYm = () => todayISO().slice(0, 7);

function ymToYearMonth(ym: string): { year: number; month: number } {
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) };
}

function poundsToDisplay(pence: number): string {
  return (pence / 100).toFixed(2);
}

function parsePounds(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function deriveFromYearly(
  yearlyPounds: number,
  workWeeks: number,
  workDays: number,
  hoursPerWeek: number,
): Record<'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly', string> {
  const weekly = yearlyPounds / workWeeks;
  return {
    yearly: yearlyPounds.toFixed(2),
    monthly: (yearlyPounds / 12).toFixed(2),
    weekly: weekly.toFixed(2),
    daily: (weekly / workDays).toFixed(2),
    hourly: (weekly / hoursPerWeek).toFixed(2),
  };
}

function toYearlyPounds(
  field: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly',
  pounds: number,
  workWeeks: number,
  workDays: number,
  hoursPerWeek: number,
): number {
  switch (field) {
    case 'yearly': return pounds;
    case 'monthly': return pounds * 12;
    case 'weekly': return pounds * workWeeks;
    case 'daily': return pounds * workWeeks * workDays;
    case 'hourly': return pounds * workWeeks * hoursPerWeek;
  }
}

// ── default config values (for empty fields) ─────────────────────────────────

const EMPTY_CONFIG_FIELDS = {
  hours_per_week: '37',
  work_weeks_per_year: '52',
  work_days_per_week: '5',
  employee_pension_pct: '',
  employer_pension_pct: '',
  personal_allowance_pence: '',
  basic_rate_band_pence: '',
  additional_rate_threshold_pence: '',
  basic_rate_pct: '',
  higher_rate_pct: '',
  additional_rate_pct: '',
  ni_lower_monthly_pence: '',
  ni_upper_monthly_pence: '',
  ni_primary_pct: '',
  ni_upper_pct: '',
  sl_enabled: false,
  sl_threshold_yearly_pence: '28470.00',
  sl_rate_pct: '9',
  sl_balance_pence: '',
  sl_interest_rate_pct: '',
};

function configToFields(cfg: SalaryConfig) {
  return {
    hours_per_week: String(cfg.hours_per_week),
    work_weeks_per_year: String(cfg.work_weeks_per_year),
    work_days_per_week: String(cfg.work_days_per_week),
    employee_pension_pct: String(cfg.employee_pension_pct),
    employer_pension_pct: String(cfg.employer_pension_pct),
    personal_allowance_pence: poundsToDisplay(cfg.personal_allowance_pence),
    basic_rate_band_pence: poundsToDisplay(cfg.basic_rate_band_pence),
    additional_rate_threshold_pence: poundsToDisplay(cfg.additional_rate_threshold_pence),
    basic_rate_pct: String(cfg.basic_rate_pct),
    higher_rate_pct: String(cfg.higher_rate_pct),
    additional_rate_pct: String(cfg.additional_rate_pct),
    ni_lower_monthly_pence: poundsToDisplay(cfg.ni_lower_monthly_pence),
    ni_upper_monthly_pence: poundsToDisplay(cfg.ni_upper_monthly_pence),
    ni_primary_pct: String(cfg.ni_primary_pct),
    ni_upper_pct: String(cfg.ni_upper_pct),
    sl_enabled: cfg.sl_enabled,
    sl_threshold_yearly_pence: cfg.sl_threshold_yearly_pence > 0 ? poundsToDisplay(cfg.sl_threshold_yearly_pence) : '',
    sl_rate_pct: String(cfg.sl_rate_pct),
    sl_balance_pence: cfg.sl_balance_pence != null ? poundsToDisplay(cfg.sl_balance_pence) : '',
    sl_interest_rate_pct: cfg.sl_interest_rate_pct != null ? String(cfg.sl_interest_rate_pct) : '',
  };
}

type ConfigFields = typeof EMPTY_CONFIG_FIELDS;

function fieldsToConfig(year: number, month: number, grossPounds: number, note: string, fields: ConfigFields): SalaryConfig | null {
  const p = (key: keyof ConfigFields) => parseFloat(String(fields[key]));
  const pence = (key: keyof ConfigFields) => Math.round(p(key) * 100);

  const cfg: SalaryConfig = {
    year, month,
    gross_yearly_pence: Math.round(grossPounds * 100),
    note: note.trim() || null,
    hours_per_week: p('hours_per_week'),
    work_weeks_per_year: p('work_weeks_per_year'),
    work_days_per_week: p('work_days_per_week'),
    employee_pension_pct: p('employee_pension_pct'),
    employer_pension_pct: p('employer_pension_pct'),
    personal_allowance_pence: pence('personal_allowance_pence'),
    basic_rate_band_pence: pence('basic_rate_band_pence'),
    additional_rate_threshold_pence: pence('additional_rate_threshold_pence'),
    basic_rate_pct: p('basic_rate_pct'),
    higher_rate_pct: p('higher_rate_pct'),
    additional_rate_pct: p('additional_rate_pct'),
    ni_lower_monthly_pence: pence('ni_lower_monthly_pence'),
    ni_upper_monthly_pence: pence('ni_upper_monthly_pence'),
    ni_primary_pct: p('ni_primary_pct'),
    ni_upper_pct: p('ni_upper_pct'),
    sl_enabled: Boolean(fields.sl_enabled),
    sl_threshold_yearly_pence: pence('sl_threshold_yearly_pence'),
    sl_rate_pct: p('sl_rate_pct'),
    sl_balance_pence: fields.sl_balance_pence ? Math.round(parseFloat(String(fields.sl_balance_pence)) * 100) : null,
    sl_interest_rate_pct: fields.sl_interest_rate_pct ? parseFloat(String(fields.sl_interest_rate_pct)) : null,
  };

  // Validate required numerics are finite
  const required: (keyof SalaryConfig)[] = [
    'hours_per_week', 'work_weeks_per_year', 'work_days_per_week',
    'employee_pension_pct', 'employer_pension_pct',
    'personal_allowance_pence', 'basic_rate_band_pence', 'additional_rate_threshold_pence',
    'basic_rate_pct', 'higher_rate_pct', 'additional_rate_pct',
    'ni_lower_monthly_pence', 'ni_upper_monthly_pence', 'ni_primary_pct', 'ni_upper_pct',
    'sl_threshold_yearly_pence', 'sl_rate_pct',
  ];
  for (const k of required) {
    if (!Number.isFinite(cfg[k] as number)) return null;
  }
  return cfg;
}

// ── sub-components (module scope — NOT inside Salary() to keep stable identity across re-renders) ─

const labelClass = 'block text-xs uppercase tracking-wide text-ink-faint mb-1';
const poundInputClass = 'w-full rounded-md border border-hairline bg-paper py-2 pl-7 pr-3 text-sm text-ink outline-none focus:border-ink/40';

function PoundInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">£</span>
        <input className={poundInputClass} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0.00" />
      </div>
    </div>
  );
}

function PctInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input className="w-full rounded-md border border-hairline bg-paper py-2 pl-3 pr-7 text-sm text-ink outline-none focus:border-ink/40" value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">%</span>
      </div>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

const GROSS_FIELDS = ['yearly', 'monthly', 'weekly', 'daily', 'hourly'] as const;
type GrossField = (typeof GROSS_FIELDS)[number];

const GROSS_LABELS: Record<GrossField, string> = {
  yearly: 'Yearly', monthly: 'Monthly', weekly: 'Weekly', daily: 'Daily', hourly: 'Hourly',
};

export function Salary({ data, ym, onYmChange }: { data: LedgerData; ym: string; onYmChange: (ym: string) => void }) {
  const { refresh } = useData();
  const [inheritedFrom, setInheritedFrom] = useState<{ year: number; month: number } | null>(null);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  // Gross input fields
  const [gross, setGross] = useState<Record<GrossField, string>>({ yearly: '', monthly: '', weekly: '', daily: '', hourly: '' });
  const [note, setNote] = useState('');

  // Time & hours disclosure
  const [timeOpen, setTimeOpen] = useState(false);

  // Config state (strings for input binding)
  const [configFields, setConfigFields] = useState<ConfigFields>(EMPTY_CONFIG_FIELDS);
  const [configEditing, setConfigEditing] = useState(false);
  const [configDraft, setConfigDraft] = useState<ConfigFields>(EMPTY_CONFIG_FIELDS);

  // Save / clear state
  const [saving, setSaving] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load config when month changes
  const load = useCallback(async (ymStr: string) => {
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    setClearArmed(false);
    const { year, month } = ymToYearMonth(ymStr);
    try {
      const resp = await getSalaryConfig(year, month);
      setInheritedFrom(resp.inheritedFrom);
      setHasSavedConfig(resp.config != null && resp.inheritedFrom === null);
      if (resp.config) {
        const fields = configToFields(resp.config);
        setConfigFields(fields);
        setConfigDraft(fields);
        const yearlyPounds = resp.config.gross_yearly_pence / 100;
        const wks = resp.config.work_weeks_per_year;
        const days = resp.config.work_days_per_week;
        const hrs = resp.config.hours_per_week;
        setGross(deriveFromYearly(yearlyPounds, wks, days, hrs));
        setNote(resp.config.note ?? '');
      } else {
        setConfigFields(EMPTY_CONFIG_FIELDS);
        setConfigDraft(EMPTY_CONFIG_FIELDS);
        setGross({ yearly: '', monthly: '', weekly: '', daily: '', hourly: '' });
        setNote('');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(ym); }, [ym, load]);

  // Handle editing any gross field — derive the OTHER 4 fields, leave the active one as typed.
  // Deriving all 5 (including the active field) would reformat it on every keystroke, losing focus.
  const onGrossChange = (field: GrossField, value: string) => {
    const pounds = parsePounds(value);
    setGross((prev) => {
      if (pounds == null) return { ...prev, [field]: value };
      const wks = parseFloat(configFields.work_weeks_per_year) || 52;
      const days = parseFloat(configFields.work_days_per_week) || 5;
      const hrs = parseFloat(configFields.hours_per_week) || 37;
      const yearlyPounds = toYearlyPounds(field, pounds, wks, days, hrs);
      const derived = deriveFromYearly(yearlyPounds, wks, days, hrs);
      return { ...derived, [field]: value }; // keep active field as-is
    });
  };

  // Breakdown calculation (memoised)
  const breakdown = useMemo(() => {
    const yearlyPounds = parsePounds(gross.yearly);
    if (yearlyPounds == null) return null;
    const { year, month } = ymToYearMonth(ym);
    const cfg = fieldsToConfig(year, month, yearlyPounds, note, configFields);
    if (!cfg) return null;
    try { return calcSalary(cfg); } catch { return null; }
  }, [gross.yearly, note, configFields, ym]);

  // Save — breakdown is always non-null here (Save button is disabled when breakdown is null)
  const onSave = async () => {
    if (!breakdown) return;
    const yearlyPounds = parsePounds(gross.yearly);
    if (yearlyPounds == null) return;
    const { year, month } = ymToYearMonth(ym);
    const cfg = fieldsToConfig(year, month, yearlyPounds, note, configFields);
    if (!cfg) { setError('Some config fields are invalid — please check the config panel.'); return; }
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await saveSalaryConfig(cfg, breakdown.netMonthlyPence);
      await refresh();
      setSaveSuccess(true);
      setInheritedFrom(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    if (!clearArmed) { setClearArmed(true); return; }
    const { year, month } = ymToYearMonth(ym);
    setError(null);
    try {
      await deleteSalaryConfig(year, month);
      await refresh();
      await load(ym);
    } catch (e) {
      setError(String(e));
      setClearArmed(false);
    }
  };

  const hasTransactions =
    data.entries.some((e) => e.date.startsWith(ym)) ||
    data.lists.some((l) => l.date.startsWith(ym));
  const showNoTxnWarning = !hasTransactions && ym !== currentYm();

  // Determine if saving this month updates the default
  const isPastMonth = ym < currentYm();

  // Config panel helpers
  const startEdit = () => { setConfigDraft({ ...configFields }); setConfigEditing(true); };
  const cancelEdit = () => setConfigEditing(false);
  const saveEdit = () => { setConfigFields({ ...configDraft }); setConfigEditing(false); };
  const setDraft = (key: keyof ConfigFields, value: string | boolean) =>
    setConfigDraft((prev) => ({ ...prev, [key]: value }));

  // ── render helpers ────────────────────────────────────────────────────────

  const inputClass = 'w-full rounded-md border border-hairline bg-paper py-2 px-3 text-sm text-ink outline-none focus:border-ink/40';

  return (
    <div className="flex flex-col gap-8">
      {/* Month picker + inherited indicator */}
      <div className="flex flex-wrap items-center gap-4">
        <MonthPicker ym={ym} onChange={onYmChange} />
        {inheritedFrom && (
          <span className="text-xs text-ink-muted">
            Showing values inherited from {monthLabel(`${inheritedFrom.year}-${String(inheritedFrom.month).padStart(2, '0')}`)}
          </span>
        )}
      </div>

      {loading ? (
        <Panel>Loading salary config…</Panel>
      ) : (
        <>
          {/* ── Gross Input ── */}
          <section className="rounded-lg border border-hairline bg-panel p-5">
            <h2 className="mb-4 font-serif text-base font-medium text-ink">Gross Pay</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {GROSS_FIELDS.map((field) => (
                <PoundInput
                  key={field}
                  label={GROSS_LABELS[field]}
                  value={gross[field]}
                  onChange={(v) => onGrossChange(field, v)}
                />
              ))}
            </div>
            <div className="mt-3">
              <label className={labelClass}>Note</label>
              <input
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. April pay rise + 2026/27 tax year"
              />
            </div>

            {/* Time & Hours disclosure */}
            <button
              type="button"
              onClick={() => setTimeOpen((o) => !o)}
              className="mt-4 flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
            >
              <span className={`transition-transform ${timeOpen ? 'rotate-90' : ''}`}>▶</span>
              Time & Hours
            </button>
            {timeOpen && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Hours / week</label>
                  <input className={inputClass} value={configFields.hours_per_week} onChange={(e) => setConfigFields((p) => ({ ...p, hours_per_week: e.target.value }))} inputMode="decimal" />
                </div>
                <div>
                  <label className={labelClass}>Work weeks / year</label>
                  <input className={inputClass} value={configFields.work_weeks_per_year} onChange={(e) => setConfigFields((p) => ({ ...p, work_weeks_per_year: e.target.value }))} inputMode="decimal" />
                </div>
                <div>
                  <label className={labelClass}>Work days / week</label>
                  <input className={inputClass} value={configFields.work_days_per_week} onChange={(e) => setConfigFields((p) => ({ ...p, work_days_per_week: e.target.value }))} inputMode="decimal" />
                </div>
              </div>
            )}
          </section>

          {/* ── Config Panel ── */}
          <section className="rounded-lg border border-hairline bg-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-base font-medium text-ink">Tax & Deduction Parameters</h2>
              {!configEditing && (
                <button type="button" onClick={startEdit} className="text-xs text-accent hover:underline">Edit</button>
              )}
            </div>

            {configEditing ? (
              <>
                <div className="mb-4">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Pension</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <PctInput label="Employee %" value={configDraft.employee_pension_pct} onChange={(v) => setDraft('employee_pension_pct', v)} />
                    <PctInput label="Employer %" value={configDraft.employer_pension_pct} onChange={(v) => setDraft('employer_pension_pct', v)} />
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Income Tax</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <PoundInput label="Personal Allowance" value={configDraft.personal_allowance_pence} onChange={(v) => setDraft('personal_allowance_pence', v)} />
                    <PoundInput label="Basic Rate Band" value={configDraft.basic_rate_band_pence} onChange={(v) => setDraft('basic_rate_band_pence', v)} />
                    <PoundInput label="Additional Rate Threshold" value={configDraft.additional_rate_threshold_pence} onChange={(v) => setDraft('additional_rate_threshold_pence', v)} />
                    <PctInput label="Basic Rate" value={configDraft.basic_rate_pct} onChange={(v) => setDraft('basic_rate_pct', v)} />
                    <PctInput label="Higher Rate" value={configDraft.higher_rate_pct} onChange={(v) => setDraft('higher_rate_pct', v)} />
                    <PctInput label="Additional Rate" value={configDraft.additional_rate_pct} onChange={(v) => setDraft('additional_rate_pct', v)} />
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">National Insurance (monthly thresholds)</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <PoundInput label="Lower Threshold" value={configDraft.ni_lower_monthly_pence} onChange={(v) => setDraft('ni_lower_monthly_pence', v)} />
                    <PoundInput label="Upper Threshold" value={configDraft.ni_upper_monthly_pence} onChange={(v) => setDraft('ni_upper_monthly_pence', v)} />
                    <PctInput label="Primary Rate" value={configDraft.ni_primary_pct} onChange={(v) => setDraft('ni_primary_pct', v)} />
                    <PctInput label="Upper Rate" value={configDraft.ni_upper_pct} onChange={(v) => setDraft('ni_upper_pct', v)} />
                  </div>
                </div>
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Student Loan</h3>
                  <div className="mb-3 flex items-center gap-2">
                    <input type="checkbox" id="sl-enabled" checked={Boolean(configDraft.sl_enabled)} onChange={(e) => setDraft('sl_enabled', e.target.checked)} className="h-4 w-4 accent-accent" />
                    <label htmlFor="sl-enabled" className="text-sm text-ink">Student Loan enabled</label>
                  </div>
                  {configDraft.sl_enabled && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <PoundInput label="Threshold (yearly)" value={configDraft.sl_threshold_yearly_pence} onChange={(v) => setDraft('sl_threshold_yearly_pence', v)} />
                      <PctInput label="Rate" value={configDraft.sl_rate_pct} onChange={(v) => setDraft('sl_rate_pct', v)} />
                      <PoundInput label="Balance (optional)" value={configDraft.sl_balance_pence} onChange={(v) => setDraft('sl_balance_pence', v)} />
                      <PctInput label="Interest rate (optional)" value={configDraft.sl_interest_rate_pct} onChange={(v) => setDraft('sl_interest_rate_pct', v)} />
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={saveEdit} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90">Save Config</button>
                  <button type="button" onClick={cancelEdit} className="rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-paper">Cancel</button>
                </div>
              </>
            ) : (
              /* Read-only summary */
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
                {[
                  ['Employee pension', `${configFields.employee_pension_pct}%`],
                  ['Employer pension', `${configFields.employer_pension_pct}%`],
                  ['Personal allowance', configFields.personal_allowance_pence ? `£${configFields.personal_allowance_pence}` : '—'],
                  ['Basic rate band', configFields.basic_rate_band_pence ? `£${configFields.basic_rate_band_pence}` : '—'],
                  ['Tax rates', configFields.basic_rate_pct ? `${configFields.basic_rate_pct} / ${configFields.higher_rate_pct} / ${configFields.additional_rate_pct}%` : '—'],
                  ['NI thresholds', configFields.ni_lower_monthly_pence ? `£${configFields.ni_lower_monthly_pence} – £${configFields.ni_upper_monthly_pence}/mo` : '—'],
                  ['NI rates', configFields.ni_primary_pct ? `${configFields.ni_primary_pct} / ${configFields.ni_upper_pct}%` : '—'],
                  ['Student Loan', configFields.sl_enabled ? `enabled · ${configFields.sl_rate_pct}% above £${configFields.sl_threshold_yearly_pence}` : 'disabled'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-hairline py-1">
                    <span className="text-ink-muted">{k}</span>
                    <span className="text-ink">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Breakdown Table ── */}
          {breakdown && (
            <section className="rounded-lg border border-hairline bg-panel p-5">
              <h2 className="mb-4 font-serif text-base font-medium text-ink">Salary Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-xs uppercase tracking-wide text-ink-faint">
                      <th className="pb-2 text-left font-normal">Row</th>
                      {['Yearly', 'Monthly', 'Weekly', 'Daily', 'Hourly'].map((h) => (
                        <th key={h} className="pb-2 text-right font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.rows.map((r) => {
                      const fmt = (v: number) =>
                        r.isPercentage
                          ? `${(v * 100).toFixed(1)}%`
                          : formatGBP(v);
                      const rowClass = [
                        'border-b border-hairline',
                        r.isSummary ? 'font-medium' : '',
                        r.isDeduction ? 'text-ink-muted' : 'text-ink',
                        r.key === 'netPay' ? 'text-accent' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <tr key={r.key} className={rowClass}>
                          <td className="py-1.5 pr-4">{r.label}</td>
                          {(['yearly', 'monthly', 'weekly', 'daily', 'hourly'] as const).map((col) => (
                            <td key={col} className="py-1.5 text-right tabular-nums">{fmt(r.figures[col])}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Save / Clear ── */}
          <div className="flex flex-col gap-2">
            {showNoTxnWarning && (
              <p className="text-xs text-warn">
                No transactions in {monthLabel(ym)} — make sure this is the right month.
              </p>
            )}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !breakdown}
                className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save Income'}
              </button>
              {hasSavedConfig && (
                <button
                  type="button"
                  onClick={onClear}
                  className={`text-sm ${clearArmed ? 'text-over font-medium' : 'text-ink-muted hover:text-over'}`}
                >
                  {clearArmed ? 'Confirm clear' : 'Clear month'}
                </button>
              )}
              {saveSuccess && <span className="text-sm text-ink-muted">Saved ✓</span>}
            </div>
            {isPastMonth && (
              <p className="text-xs text-ink-muted">
                Saving to {monthLabel(ym)} only · won't update default income
              </p>
            )}
            {error && <p className="text-sm text-over">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
