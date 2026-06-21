import { useState } from 'react';
import { inputClass, labelClass, PctInput, PoundInput } from './salaryInputs';
import type { ConfigFields } from './salaryState';
import type { SalarySaveBarProps } from './SalarySaveBar';
import { SalarySaveBar } from './SalarySaveBar';

export interface ConfigTabProps {
  configFields: ConfigFields;
  setConfigFields: React.Dispatch<React.SetStateAction<ConfigFields>>;
  saveBarProps: SalarySaveBarProps;
}

export function ConfigTab({ configFields, setConfigFields, saveBarProps }: ConfigTabProps) {
  const set = (key: keyof ConfigFields, v: string | boolean) =>
    setConfigFields((p) => ({ ...p, [key]: v }));

  const [showBalance, setShowBalance] = useState(() => configFields.sl_balance_pence !== '');

  return (
    <>
      <section className="rounded-lg border border-hairline bg-panel p-5">
        <div className="mb-4">
          <h2 className="font-serif text-base font-medium text-ink">Tax & Deduction Parameters</h2>
        </div>

        <div className="mb-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Time & Hours</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Hours / week</label>
              <input className={inputClass} value={configFields.hours_per_week}
                onChange={(e) => set('hours_per_week', e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label className={labelClass}>Work weeks / year</label>
              <input className={inputClass} value={configFields.work_weeks_per_year}
                onChange={(e) => set('work_weeks_per_year', e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label className={labelClass}>Work days / week</label>
              <input className={inputClass} value={configFields.work_days_per_week}
                onChange={(e) => set('work_days_per_week', e.target.value)} inputMode="decimal" />
            </div>
          </div>
        </div>

        <div className="mb-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Pension</h3>
          <div className="grid grid-cols-2 gap-3">
            <PctInput label="Employee %" value={configFields.employee_pension_pct} onChange={(v) => set('employee_pension_pct', v)} />
            <PctInput label="Employer %" value={configFields.employer_pension_pct} onChange={(v) => set('employer_pension_pct', v)} />
          </div>
        </div>

        <div className="mb-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Income Tax</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <PoundInput label="Personal Allowance" value={configFields.personal_allowance_pence} onChange={(v) => set('personal_allowance_pence', v)} />
            <PoundInput label="Basic Rate Band" value={configFields.basic_rate_band_pence} onChange={(v) => set('basic_rate_band_pence', v)} />
            <PoundInput label="Additional Rate Threshold" value={configFields.additional_rate_threshold_pence} onChange={(v) => set('additional_rate_threshold_pence', v)} />
            <PctInput label="Basic Rate" value={configFields.basic_rate_pct} onChange={(v) => set('basic_rate_pct', v)} />
            <PctInput label="Higher Rate" value={configFields.higher_rate_pct} onChange={(v) => set('higher_rate_pct', v)} />
            <PctInput label="Additional Rate" value={configFields.additional_rate_pct} onChange={(v) => set('additional_rate_pct', v)} />
          </div>
        </div>

        <div className="mb-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">National Insurance (monthly thresholds)</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PoundInput label="Lower Threshold" value={configFields.ni_lower_monthly_pence} onChange={(v) => set('ni_lower_monthly_pence', v)} />
            <PoundInput label="Upper Threshold" value={configFields.ni_upper_monthly_pence} onChange={(v) => set('ni_upper_monthly_pence', v)} />
            <PctInput label="Primary Rate" value={configFields.ni_primary_pct} onChange={(v) => set('ni_primary_pct', v)} />
            <PctInput label="Upper Rate" value={configFields.ni_upper_pct} onChange={(v) => set('ni_upper_pct', v)} />
          </div>
        </div>

        <div className="mb-6">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Student Loan</h3>
          <div className="mb-3 flex items-center gap-2">
            <input type="checkbox" id="sl-enabled" checked={Boolean(configFields.sl_enabled)} onChange={(e) => set('sl_enabled', e.target.checked)} className="h-4 w-4 accent-accent" />
            <label htmlFor="sl-enabled" className="text-sm text-ink">Student Loan enabled</label>
          </div>
          {configFields.sl_enabled && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <PoundInput label="Threshold (yearly)" value={configFields.sl_threshold_yearly_pence} onChange={(v) => set('sl_threshold_yearly_pence', v)} />
                <PctInput label="Rate" value={configFields.sl_rate_pct} onChange={(v) => set('sl_rate_pct', v)} />
                <PctInput label="Annual interest rate (%)" value={configFields.sl_interest_rate_pct} onChange={(v) => set('sl_interest_rate_pct', v)} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="sl-set-balance"
                  checked={configFields.sl_balance_pence !== '' || showBalance}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setShowBalance(true);
                    } else {
                      setShowBalance(false);
                      setConfigFields((p) => ({ ...p, sl_balance_pence: '' }));
                    }
                  }}
                  className="h-4 w-4 accent-accent" />
                <label htmlFor="sl-set-balance" className="text-sm text-ink">Set balance (new loan terms)</label>
              </div>
              {(configFields.sl_balance_pence !== '' || showBalance) && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <PoundInput label="Balance" value={configFields.sl_balance_pence} onChange={(v) => set('sl_balance_pence', v)} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <PoundInput label="Extra payment this month" value={configFields.extra_payment_pence} onChange={(v) => set('extra_payment_pence', v)} />
              </div>
            </div>
          )}
        </div>
      </section>

      <SalarySaveBar {...saveBarProps} />
    </>
  );
}
