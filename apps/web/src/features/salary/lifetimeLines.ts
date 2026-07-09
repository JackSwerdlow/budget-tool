import type { LifetimeTotals } from '@budget/core';

export type LifetimeLine = {
  key: string;
  label: string;
  pence: number;
  depth: 0 | 1 | 2;
  tone: 'normal' | 'deduction' | 'net' | 'muted';
  parent?: string;
  group?: boolean;
};

export function lifetimeLines(t: LifetimeTotals): LifetimeLine[] {
  const deductionsTotal = -(
    t.employeePensionPence +
    t.incomeTaxPence +
    t.niPence +
    t.studentLoanPaidPence
  );

  const lines: LifetimeLine[] = [
    { key: 'grossEarned', label: 'Gross earned', pence: t.grossPence, depth: 0, tone: 'normal', group: true },
    { key: 'basePay', label: 'Base pay', pence: t.basePayPence, depth: 1, tone: 'normal', parent: 'grossEarned' },
    { key: 'bonus', label: 'Bonus', pence: t.bonusPence, depth: 1, tone: t.bonusPence === 0 ? 'muted' : 'normal', parent: 'grossEarned' },

    { key: 'deductions', label: 'Deductions', pence: deductionsTotal, depth: 0, tone: 'deduction', group: true },
    { key: 'employeePension', label: 'Employee pension', pence: -t.employeePensionPence, depth: 1, tone: 'deduction', parent: 'deductions' },
    { key: 'incomeTax', label: 'Income tax', pence: -t.incomeTaxPence, depth: 1, tone: 'deduction', parent: 'deductions', group: true },
    { key: 'allowanceUsed', label: 'Allowance used', pence: t.allowanceUsedPence, depth: 2, tone: 'muted', parent: 'incomeTax' },
    { key: 'basic', label: 'Basic rate', pence: -t.basicPence, depth: 2, tone: 'deduction', parent: 'incomeTax' },
    { key: 'higher', label: 'Higher rate', pence: -t.higherPence, depth: 2, tone: 'deduction', parent: 'incomeTax' },
    ...(t.additionalPence > 0
      ? [{ key: 'additional', label: 'Additional rate', pence: -t.additionalPence, depth: 2 as const, tone: 'deduction' as const, parent: 'incomeTax' }]
      : []),
    { key: 'ni', label: 'National insurance', pence: -t.niPence, depth: 1, tone: 'deduction', parent: 'deductions' },
    { key: 'studentLoanPaid', label: 'Student loan paid', pence: -t.studentLoanPaidPence, depth: 1, tone: 'deduction', parent: 'deductions' },

    // One-off untaxed income (gifts etc.) is inside net take-home; split it out when present.
    { key: 'netTakeHome', label: 'Net take-home', pence: t.netTakeHomePence, depth: 0, tone: 'net', group: t.untaxedIncomePence > 0 },
    ...(t.untaxedIncomePence > 0
      ? [
          { key: 'payrollNet', label: 'From payroll', pence: t.netTakeHomePence - t.untaxedIncomePence, depth: 1 as const, tone: 'net' as const, parent: 'netTakeHome' },
          { key: 'untaxedIncome', label: 'Untaxed income', pence: t.untaxedIncomePence, depth: 1 as const, tone: 'normal' as const, parent: 'netTakeHome' },
        ]
      : []),

    { key: 'pensionPot', label: 'Pension pot', pence: t.pensionPotPence, depth: 0, tone: 'normal', group: true },
    { key: 'employerContributed', label: 'Employer contributed', pence: t.employerPensionPence, depth: 1, tone: 'normal', parent: 'pensionPot' },
    { key: 'employeeContributed', label: 'Employee contributed', pence: t.employeePensionPence, depth: 1, tone: 'normal', parent: 'pensionPot' },
  ];

  return lines;
}
