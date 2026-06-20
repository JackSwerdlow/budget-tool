import type { LifetimeTotals, SalaryBreakdown } from '@budget/core';
import { monthLabel } from '../../lib/dates';
import { BreakdownTable, KeyFigures, RateStrip } from './SalaryView';
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
  configFields: ConfigFields;
  setConfigFields: (updater: (prev: ConfigFields) => ConfigFields) => void;
  breakdown: SalaryBreakdown | null;
  lifetime: LifetimeTotals;
  ym: string;
  saveBarProps: SalarySaveBarProps;
}

export function SummaryTab({
  gross,
  onGrossChange,
  note,
  setNote,
  configFields,
  setConfigFields,
  breakdown,
  lifetime,
  ym,
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
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <PoundInput label="Bonus (monthly)" value={configFields.bonus_pence}
            onChange={(v) => setConfigFields((p) => ({ ...p, bonus_pence: v }))} />
          <div className="sm:col-span-4">
            <label className={labelClass}>Note</label>
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. April pay rise + 2026/27 tax year" />
          </div>
        </div>
      </section>

      {breakdown && (
        <>
          <RateStrip rows={breakdown.view.rateStrip} />
          <BreakdownTable lines={breakdown.view.breakdown} />
          <KeyFigures
            stats={breakdown.view.stats}
            pensionFundPence={lifetime.pensionPotPence}
            studentDebtPence={null}
            ymLabel={monthLabel(ym)}
          />
        </>
      )}

      <SalarySaveBar {...saveBarProps} />
    </>
  );
}
