import { useCallback, useEffect, useMemo, useState } from 'react';
import { calcSalary, computeLifetime, type LedgerData, type SalaryConfig, type SalaryYTD } from '@budget/core';
import { deleteSalaryConfig, getAllSalaryConfigs, getSalaryConfig, getSalaryYTD, saveSalaryConfig } from '../../api';
import { MonthPicker, Panel, Segmented } from '../../components/ui';
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
  toYearlyPounds,
  ymToYearMonth,
  type ConfigFields,
  type GrossField,
} from './salaryState';

type Subtab = 'summary' | 'lifetime' | 'config';

export function Salary({ data, ym, onYmChange }: { data: LedgerData; ym: string; onYmChange: (ym: string) => void }) {
  const { refresh } = useData();
  const [subtab, setSubtab] = useState<Subtab>('summary');
  const [inheritedFrom, setInheritedFrom] = useState<{ year: number; month: number } | null>(null);
  const [employmentStart, setEmploymentStart] = useState<{ year: number; month: number } | null>(null);
  const [ytdData, setYtdData] = useState<SalaryYTD | null>(null);
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
      const [resp, ytd, configs] = await Promise.all([
        getSalaryConfig(year, month),
        getSalaryYTD(year, month),
        getAllSalaryConfigs(),
      ]);
      setAllConfigs(configs);
      setInheritedFrom(resp.inheritedFrom);
      setEmploymentStart(resp.employmentStart ?? null);
      setYtdData(ytd);
      setHasSavedConfig(resp.config != null && resp.inheritedFrom === null);
      if (resp.config) {
        const fields = configToFields(resp.config);
        if (resp.inheritedFrom) {
          fields.sl_balance_pence = '';
          fields.extra_payment_pence = '';
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
      return { ...derived, [field]: value };
    });
  };

  const breakdown = useMemo(() => {
    const yearlyPounds = parsePounds(gross.yearly);
    if (yearlyPounds == null) return null;
    const { year, month } = ymToYearMonth(ym);
    const cfg = fieldsToConfig(year, month, yearlyPounds, note, configFields);
    if (!cfg) return null;
    const ytdInput = ytdData
      ? {
          adjustedNetYTDPence: ytdData.adjustedNetYTDPence,
          priorAdjNetYTDPence: ytdData.priorAdjNetYTDPence,
          grossYTDPence: ytdData.grossYTDPence,
          employeePensionYTDPence: ytdData.employeePensionYTDPence,
          employerPensionYTDPence: ytdData.employerPensionYTDPence,
          niYTDPence: ytdData.niYTDPence,
          slYTDPence: ytdData.slYTDPence,
        }
      : undefined;
    try { return calcSalary(cfg, employmentStart ?? { year, month }, ytdInput); } catch { return null; }
  }, [gross.yearly, note, configFields, ym, employmentStart, ytdData]);

  const lifetime = useMemo(() => computeLifetime(allConfigs, ymToYearMonth(ym)), [allConfigs, ym]);

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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-4">
        <MonthPicker ym={ym} onChange={onYmChange} />
        {inheritedFrom && (
          <span className="text-xs text-ink-muted">
            Showing values inherited from {monthLabel(`${inheritedFrom.year}-${String(inheritedFrom.month).padStart(2, '0')}`)}
          </span>
        )}
      </div>

      <Segmented
        value={subtab}
        onChange={setSubtab}
        options={[
          { id: 'summary', label: 'Summary' },
          { id: 'lifetime', label: 'Lifetime' },
          { id: 'config', label: 'Config' },
        ]}
      />

      {loading ? (
        <Panel>Loading salary config…</Panel>
      ) : subtab === 'summary' ? (
        <SummaryTab
          gross={gross}
          onGrossChange={onGrossChange}
          note={note}
          setNote={setNote}
          configFields={configFields}
          setConfigFields={setConfigFields}
          breakdown={breakdown}
          lifetime={lifetime}
          ym={ym}
          saveBarProps={saveBarProps}
        />
      ) : subtab === 'lifetime' ? (
        <LifetimeTab lifetime={lifetime} ym={ym} />
      ) : (
        <ConfigTab
          configFields={configFields}
          setConfigFields={setConfigFields}
          saveBarProps={saveBarProps}
        />
      )}
    </div>
  );
}

