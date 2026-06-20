import type { SalaryBreakdown } from '@budget/core';
import { BreakdownTable, PensionPanel, RateStrip, StatsPanel } from './SalaryView';
import { inputClass, labelClass, PoundInput } from './salaryInputs';
import type { ConfigFields, GrossField } from './salaryState';
import { GROSS_FIELDS, GROSS_LABELS } from './salaryState';
import type { SalarySaveBarProps } from './SalarySaveBar';
import { SalarySaveBar } from './SalarySaveBar';

export interface SummaryTabProps {
  gross: Record<GrossField, string>;
  onGrossChange: (field: GrossField, value: string) => void;
  note: string;
  setNote: (v: string) => void;
  timeOpen: boolean;
  setTimeOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  configFields: ConfigFields;
  setConfigFields: (updater: (prev: ConfigFields) => ConfigFields) => void;
  breakdown: SalaryBreakdown | null;
  saveBarProps: SalarySaveBarProps;
}

export function SummaryTab({
  gross,
  onGrossChange,
  note,
  setNote,
  timeOpen,
  setTimeOpen,
  configFields,
  setConfigFields,
  breakdown,
  saveBarProps,
}: SummaryTabProps) {
  return (
    <>
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

        <button
          type="button"
          onClick={() => setTimeOpen((o) => !o)}
          className="mt-4 flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          <span className={`transition-transform ${timeOpen ? 'rotate-90' : ''}`}>▶</span>
          Pay Details
        </button>
        {timeOpen && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PoundInput
              label="Monthly Bonus"
              value={configFields.bonus_pence}
              onChange={(v) => setConfigFields((p) => ({ ...p, bonus_pence: v }))}
            />
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

      {breakdown && (
        <>
          <RateStrip rows={breakdown.view.rateStrip} />
          <BreakdownTable lines={breakdown.view.breakdown} />
          <div className="flex flex-col gap-8 sm:flex-row">
            <StatsPanel stats={breakdown.view.stats} />
            <PensionPanel rows={breakdown.view.pension} />
          </div>
        </>
      )}

      <SalarySaveBar {...saveBarProps} />
    </>
  );
}
