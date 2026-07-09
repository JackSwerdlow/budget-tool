import { describe, it, expect } from 'vitest';
import { lifetimeLines } from './lifetimeLines';
import type { LifetimeTotals } from '@budget/core';

const base: LifetimeTotals = {
  monthsCount: 6,
  grossPence: 300000,
  basePayPence: 280000,
  bonusPence: 20000,
  employeePensionPence: 18000,
  incomeTaxPence: 50000,
  allowanceUsedPence: 100000,
  basicPence: 45000,
  higherPence: 5000,
  additionalPence: 0,
  niPence: 15000,
  studentLoanPaidPence: 8000,
  untaxedIncomePence: 0,
  netTakeHomePence: 209000,
  employerPensionPence: 22000,
  pensionPotPence: 40000,
};

describe('lifetimeLines', () => {
  it('gross earned row equals grossPence', () => {
    const lines = lifetimeLines(base);
    const row = lines.find((l) => l.key === 'grossEarned')!;
    expect(row.pence).toBe(base.grossPence);
  });

  it('base pay + bonus = gross', () => {
    const lines = lifetimeLines(base);
    const basePay = lines.find((l) => l.key === 'basePay')!.pence;
    const bonus = lines.find((l) => l.key === 'bonus')!.pence;
    expect(basePay + bonus).toBe(base.grossPence);
  });

  it('deductions total = -(pension + tax + NI + SL)', () => {
    const lines = lifetimeLines(base);
    const row = lines.find((l) => l.key === 'deductions')!;
    const expected = -(base.employeePensionPence + base.incomeTaxPence + base.niPence + base.studentLoanPaidPence);
    expect(row.pence).toBe(expected);
  });

  it('pension pot row = employerPensionPence + employeePensionPence', () => {
    const lines = lifetimeLines(base);
    const pot = lines.find((l) => l.key === 'pensionPot')!;
    expect(pot.pence).toBe(base.pensionPotPence);

    const employer = lines.find((l) => l.key === 'employerContributed')!.pence;
    const employee = lines.find((l) => l.key === 'employeeContributed')!.pence;
    expect(employer + employee).toBe(base.employerPensionPence + base.employeePensionPence);
  });

  it('additional-rate row is OMITTED when additionalPence === 0', () => {
    const lines = lifetimeLines(base);
    expect(lines.find((l) => l.key === 'additional')).toBeUndefined();
  });

  it('additional-rate row is PRESENT when additionalPence > 0', () => {
    const lines = lifetimeLines({ ...base, additionalPence: 1000 });
    const row = lines.find((l) => l.key === 'additional')!;
    expect(row).toBeDefined();
    expect(row.pence).toBe(-1000);
  });

  it('deduction rows are negative', () => {
    const lines = lifetimeLines(base);
    for (const key of ['employeePension', 'incomeTax', 'ni', 'studentLoanPaid', 'basic', 'higher']) {
      const row = lines.find((l) => l.key === key)!;
      expect(row.pence).toBeLessThanOrEqual(0);
    }
  });

  it('allowance used is positive and muted', () => {
    const lines = lifetimeLines(base);
    const row = lines.find((l) => l.key === 'allowanceUsed')!;
    expect(row.pence).toBeGreaterThan(0);
    expect(row.tone).toBe('muted');
  });

  it('net take-home is positive and tone=net', () => {
    const lines = lifetimeLines(base);
    const row = lines.find((l) => l.key === 'netTakeHome')!;
    expect(row.pence).toBeGreaterThan(0);
    expect(row.tone).toBe('net');
  });

  it('normal rows are positive', () => {
    const lines = lifetimeLines(base);
    for (const key of ['grossEarned', 'basePay', 'pensionPot', 'employerContributed', 'employeeContributed']) {
      const row = lines.find((l) => l.key === key)!;
      expect(row.pence).toBeGreaterThanOrEqual(0);
    }
  });
});
