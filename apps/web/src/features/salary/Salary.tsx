import { useCallback, useEffect, useMemo, useState } from 'react';
import { calcSalary, computeLifetime, computeStudentLoan, type LedgerData, type SalaryConfig } from '@budget/core';
import { deleteSalaryConfig, getAllSalaryConfigs, getSalaryConfig, saveSalaryConfig } from '../../api';
import { MonthPicker, Panel } from '../../components/ui';
import { PinnedTabBar } from '../../components/PinnedTabBar';
import { SubTabPager } from '../../components/SubTabPager';
import { useData } from '../../data';
import { monthLabel } from '../../lib/dates';
import { ConfigTab } from './ConfigTab';
import { LifetimeTab } from './LifetimeTab';
import { SummaryTab } from './SummaryTab';
import {
  configToFields,
  currentYm,
  deriveFromYearly,
  EMPTY_CONFIG_FIELDS,
  fieldsToConfig,
  parsePounds,
  previewEmploymentStart,
  previewYtd,
  toYearlyPounds,
  ymToYearMonth,
  type ConfigFields,
  type GrossField,
} from './salaryState';

type Subtab = 'summary' | 'lifetime' | 'config';
// Slide order for the pager, and what maps its index back to a sub-tab id.
const SALARY_TABS = ['summary', 'lifetime', 'config'] as const satisfies readonly Subtab[];

export function Salary({ data, ym, onYmChange }: { data: LedgerData; ym: string; onYmChange: (ym: string) => void }) {
  const { refresh } = useData();
  const [subtab, setSubtab] = useState<Subtab>('summary');
  const onSubtabIndexChange = useCallback((i: number) => setSubtab(SALARY_TABS[i]), []);
  const [inheritedFrom, setInheritedFrom] = useState<{ year: number; month: number } | null>(null);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  const [gross, setGross] = useState<Record<GrossField, string>>({ yearly: '', monthly: '', weekly: '', daily: '', hourly: '' });
  const [note, setNote] = useState('');
  const [allConfigs, setAllConfigs] = useState<SalaryConfig[]>([]);

  const [configFields, setConfigFields] = useState<ConfigFields>(EMPTY_CONFIG_FIELDS);

  const [saving, setSaving] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async (ymStr: string) => {
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    setClearArmed(false);
    const { year, month } = ymToYearMonth(ymStr);
    try {
      const [resp, configs] = await Promise.all([
        getSalaryConfig(year, month),
        getAllSalaryConfigs(),
      ]);
      setAllConfigs(configs);
      setInheritedFrom(resp.inheritedFrom);
      setHasSavedConfig(resp.config != null && resp.inheritedFrom === null);
      if (resp.config) {
        const fields = configToFields(resp.config);
        if (resp.inheritedFrom) {
          fields.sl_balance_pence = '';
          fields.extra_payment_pence = '';
          fields.untaxed_income_pence = ''; // one-off — never inherits forward
        }
        setConfigFields(fields);
        const yearlyPounds = resp.config.gross_yearly_pence / 100;
        const wks = resp.config.work_weeks_per_year;
        const days = resp.config.work_days_per_week;
        const hrs = resp.config.hours_per_week;
        setGross(deriveFromYearly(yearlyPounds, wks, days, hrs));
        setNote(resp.config.note ?? '');
      } else {
        setConfigFields(EMPTY_CONFIG_FIELDS);
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

  const onGrossChange = (field: GrossField, value: string) => {
    const pounds = parsePounds(value);
    setGross((prev) => {
      if (pounds == null) return { ...prev, [field]: value };
      const wks = parseFloat(configFields.work_weeks_per_year) || 52;
      const days = parseFloat(configFields.work_days_per_week) || 5;
      const hrs = parseFloat(configFields.hours_per_week) || 37;
      const yearlyPounds = toYearlyPounds(field, pounds, wks, days, hrs);
      const derived = deriveFromYearly(yearlyPounds, wks, days, hrs);
      // Derive the other four fields, but never overwrite the one being typed (it would fight
      // the user's keystrokes) — re-apply the live value last.
      return { ...derived, [field]: value };
    });
  };

  const breakdown = useMemo(() => {
    const yearlyPounds = parsePounds(gross.yearly);
    if (yearlyPounds == null) return null;
    const { year, month } = ymToYearMonth(ym);
    const cfg = fieldsToConfig(year, month, yearlyPounds, note, configFields);
    if (!cfg) return null;
    // Recompute YTD live from the edited config (see previewYtd) — the server YTD is built from
    // the persisted config, so editing this month would otherwise tax it at the old salary. The
    // continuous-employment anchor is resolved in core from the edited config set.
    try {
      const ytdInput = previewYtd(allConfigs, cfg);
      const anchor = previewEmploymentStart(allConfigs, cfg);
      return calcSalary(cfg, anchor ?? { year, month }, ytdInput);
    } catch { return null; }
  }, [gross.yearly, note, configFields, ym, allConfigs]);

  const lifetime = useMemo(() => computeLifetime(allConfigs, ymToYearMonth(ym)), [allConfigs, ym]);
  const studentLoan = useMemo(() => computeStudentLoan(allConfigs, ymToYearMonth(ym)), [allConfigs, ym]);

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
      setAllConfigs(await getAllSalaryConfigs());
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

  const saveBarProps = {
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
  };

  // The inherited-from note used to sit beside the month picker; the bar's right slot is a
  // fixed two-slot row now, so it rides above the panel content instead. No margin of its own —
  // it's a child of the panel's gapped column, like every section under it.
  const inheritedNote = inheritedFrom ? (
    <p className="text-xs text-ink-muted">
      Showing values inherited from {monthLabel(`${inheritedFrom.year}-${String(inheritedFrom.month).padStart(2, '0')}`)}
    </p>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PinnedTabBar
        value={subtab}
        onChange={setSubtab}
        options={[
          { id: 'summary', label: 'Summary' },
          { id: 'lifetime', label: 'Lifetime' },
          { id: 'config', label: 'Config' },
        ]}
        right={<MonthPicker ym={ym} onChange={onYmChange} />}
      />
      {loading ? (
        <Panel>Loading salary config…</Panel>
      ) : (
        <SubTabPager index={SALARY_TABS.indexOf(subtab)} onIndexChange={onSubtabIndexChange}>
          {[
            // Both panels are gapped columns: their tabs render a flat run of bordered sections
            // (SummaryTab and ConfigTab each return a fragment), so the spacing has to live here.
            <div key="summary" className="flex flex-col gap-8">
              {inheritedNote}
              <SummaryTab
                gross={gross}
                onGrossChange={onGrossChange}
                note={note}
                setNote={setNote}
                configFields={configFields}
                setConfigFields={setConfigFields}
                breakdown={breakdown}
                lifetime={lifetime}
                studentDebtPence={studentLoan.remainingBalancePence}
                ym={ym}
                saveBarProps={saveBarProps}
              />
            </div>,
            <LifetimeTab key="lifetime" lifetime={lifetime} studentLoan={studentLoan} ym={ym} />,
            <div key="config" className="flex flex-col gap-8">
              {inheritedNote}
              <ConfigTab
                key={ym}
                configFields={configFields}
                setConfigFields={setConfigFields}
                saveBarProps={saveBarProps}
              />
            </div>,
          ]}
        </SubTabPager>
      )}
    </div>
  );
}

