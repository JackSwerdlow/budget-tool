import { PctInput, PoundInput } from './salaryInputs';
import type { ConfigFields } from './salaryState';
import type { SalarySaveBarProps } from './SalarySaveBar';
import { SalarySaveBar } from './SalarySaveBar';

export interface ConfigTabProps {
  configEditing: boolean;
  configFields: ConfigFields;
  configDraft: ConfigFields;
  startEdit: () => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  setDraft: (key: keyof ConfigFields, value: string | boolean) => void;
  saveBarProps: SalarySaveBarProps;
}

export function ConfigTab({
  configEditing,
  configFields,
  configDraft,
  startEdit,
  cancelEdit,
  saveEdit,
  setDraft,
  saveBarProps,
}: ConfigTabProps) {
  return (
    <>
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

      <SalarySaveBar {...saveBarProps} />
    </>
  );
}
