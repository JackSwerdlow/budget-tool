import type { SalaryBreakdown } from '@budget/core';
import { monthLabel } from '../../lib/dates';
import { currentYm } from './salaryState';

export interface SalarySaveBarProps {
  ym: string;
  breakdown: SalaryBreakdown | null;
  saving: boolean;
  hasSavedConfig: boolean;
  clearArmed: boolean;
  saveSuccess: boolean;
  showNoTxnWarning: boolean;
  error: string | null;
  onSave: () => void;
  onClear: () => void;
}

export function SalarySaveBar({
  ym,
  breakdown,
  saving,
  hasSavedConfig,
  clearArmed,
  saveSuccess,
  showNoTxnWarning,
  error,
  onSave,
  onClear,
}: SalarySaveBarProps) {
  const isPastMonth = ym < currentYm();

  return (
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
  );
}
