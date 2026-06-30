import { computeSalaryYTD, type SalaryConfig, type SalaryYTD, type YTDConfigRow } from '@budget/core';
import { todayISO } from '../../lib/dates';

export const currentYm = () => todayISO().slice(0, 7);

// Year-to-date for the salary PREVIEW, recomputed live from the edited current-month config.
// The cumulative PAYE method derives this month's tax by differencing cumulative YTD tax, so
// the YTD's current-month slice MUST reflect the in-progress edit — using the server YTD (built
// from the persisted config) computes the month's tax against the old salary. Mirrors the
// server's getSalaryYTD: tax-year configs ascending, current month replaced by the edit.
export function previewYtd(
  allConfigs: SalaryConfig[],
  cfg: SalaryConfig,
  employmentStart: { year: number; month: number } | null,
): SalaryYTD {
  const ty = cfg.month >= 4 ? cfg.year : cfg.year - 1;
  const inTaxYear = (c: { year: number; month: number }) =>
    (c.year > ty || (c.year === ty && c.month >= 4)) &&
    (c.year < ty + 1 || (c.year === ty + 1 && c.month <= 3));
  const toRow = (c: SalaryConfig): YTDConfigRow => ({
    year: c.year, month: c.month,
    gross_yearly_pence: c.gross_yearly_pence, bonus_pence: c.bonus_pence ?? 0,
    employee_pension_pct: c.employee_pension_pct, employer_pension_pct: c.employer_pension_pct,
    ni_lower_monthly_pence: c.ni_lower_monthly_pence, ni_upper_monthly_pence: c.ni_upper_monthly_pence,
    ni_primary_pct: c.ni_primary_pct, ni_upper_pct: c.ni_upper_pct,
    sl_enabled: c.sl_enabled ? 1 : 0,
    sl_threshold_yearly_pence: c.sl_threshold_yearly_pence, sl_rate_pct: c.sl_rate_pct,
  });
  const rows = allConfigs
    .filter((c) => inTaxYear(c) && !(c.year === cfg.year && c.month === cfg.month))
    .concat(cfg)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map(toRow);
  const start = employmentStart ?? { year: cfg.year, month: cfg.month };
  return computeSalaryYTD(rows, start, cfg.year, cfg.month);
}

export function ymToYearMonth(ym: string): { year: number; month: number } {
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) };
}

export function poundsToDisplay(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function parsePounds(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function deriveFromYearly(
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

export function toYearlyPounds(
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

export const EMPTY_CONFIG_FIELDS = {
  bonus_pence: '',
  hours_per_week: '37',
  work_weeks_per_year: '52',
  work_days_per_week: '5',
  employee_pension_pct: '',
  employer_pension_pct: '',
  personal_allowance_pence: '12579.17',
  basic_rate_band_pence: '37700.00',
  additional_rate_threshold_pence: '125140.00',
  basic_rate_pct: '20',
  higher_rate_pct: '40',
  additional_rate_pct: '45',
  ni_lower_monthly_pence: '1480.00',
  ni_upper_monthly_pence: '4189.00',
  ni_primary_pct: '8',
  ni_upper_pct: '2',
  sl_enabled: false,
  sl_threshold_yearly_pence: '29385.00',
  sl_rate_pct: '9',
  sl_balance_pence: '',
  sl_interest_rate_pct: '',
  extra_payment_pence: '',
};

export type ConfigFields = typeof EMPTY_CONFIG_FIELDS;

export function configToFields(cfg: import('@budget/core').SalaryConfig): ConfigFields {
  return {
    bonus_pence: cfg.bonus_pence && cfg.bonus_pence > 0 ? poundsToDisplay(cfg.bonus_pence / 12) : '',
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
    extra_payment_pence: cfg.extra_payment_pence && cfg.extra_payment_pence > 0 ? poundsToDisplay(cfg.extra_payment_pence) : '',
  };
}

export function fieldsToConfig(year: number, month: number, grossPounds: number, note: string, fields: ConfigFields): import('@budget/core').SalaryConfig | null {
  const p = (key: keyof ConfigFields) => parseFloat(String(fields[key]));
  const pence = (key: keyof ConfigFields) => Math.round(p(key) * 100);

  const cfg: import('@budget/core').SalaryConfig = {
    year, month,
    gross_yearly_pence: Math.round(grossPounds * 100),
    note: note.trim() || null,
    bonus_pence: fields.bonus_pence ? Math.round(parseFloat(String(fields.bonus_pence)) * 12 * 100) : 0,
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
    extra_payment_pence: fields.extra_payment_pence ? Math.max(0, Math.round(parseFloat(String(fields.extra_payment_pence)) * 100)) : 0,
  };

  const required: (keyof import('@budget/core').SalaryConfig)[] = [
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

export const GROSS_FIELDS = ['yearly', 'monthly', 'weekly', 'daily', 'hourly'] as const;
export type GrossField = (typeof GROSS_FIELDS)[number];

export const GROSS_LABELS: Record<GrossField, string> = {
  yearly: 'Yearly', monthly: 'Monthly', weekly: 'Weekly', daily: 'Daily', hourly: 'Hourly',
};
