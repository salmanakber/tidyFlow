import type { TaxRule } from './invoice-settings';
import prisma from './prisma';

export type PayrollWorkerType =
  | 'hourly'
  | 'custom'
  | 'paye_uk'
  | 'w2'
  | 'contractor_1099'
  | 'payg_au'
  | 't4_ca'
  | 'paye_nz'
  | 'eu_standard';

export interface PayrollTaxBreakdown {
  grossPay: number;
  incomeTax: number;
  socialSecurity: number;
  insurance: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  taxProfileId: string | null;
  taxProfileName: string | null;
  workerType: PayrollWorkerType;
}

export interface ProRataResult {
  fullPeriodSalary: number;
  proRataSalary: number;
  daysInPeriod: number;
  daysWorked: number;
  unpaidLeaveDays: number;
  proRataFactor: number;
}

/** Built-in presets — any country can use fully custom company-configured profiles instead. */
const BUILTIN_TAX_PROFILES: Record<
  string,
  { id: string; name: string; incomeTaxPercent: number; socialSecurityPercent: number; insurancePercent: number }
> = {
  hourly: {
    id: 'builtin_hourly',
    name: 'Standard Hourly (no auto deductions)',
    incomeTaxPercent: 0,
    socialSecurityPercent: 0,
    insurancePercent: 0,
  },
  custom: {
    id: 'builtin_custom',
    name: 'Custom / Country-specific',
    incomeTaxPercent: 0,
    socialSecurityPercent: 0,
    insurancePercent: 0,
  },
  paye_uk: {
    id: 'builtin_paye_uk',
    name: 'UK PAYE Standard',
    incomeTaxPercent: 20,
    socialSecurityPercent: 12,
    insurancePercent: 0,
  },
  w2: {
    id: 'builtin_w2_us',
    name: 'US W-2 Employee',
    incomeTaxPercent: 22,
    socialSecurityPercent: 6.2,
    insurancePercent: 1.45,
  },
  contractor_1099: {
    id: 'builtin_1099_us',
    name: 'US 1099 Contractor',
    incomeTaxPercent: 15,
    socialSecurityPercent: 0,
    insurancePercent: 0,
  },
  payg_au: {
    id: 'builtin_payg_au',
    name: 'Australia PAYG',
    incomeTaxPercent: 32.5,
    socialSecurityPercent: 0,
    insurancePercent: 0,
  },
  t4_ca: {
    id: 'builtin_t4_ca',
    name: 'Canada CPP/EI',
    incomeTaxPercent: 20,
    socialSecurityPercent: 5.95,
    insurancePercent: 0,
  },
  paye_nz: {
    id: 'builtin_paye_nz',
    name: 'New Zealand PAYE',
    incomeTaxPercent: 17.5,
    socialSecurityPercent: 3,
    insurancePercent: 0,
  },
  eu_standard: {
    id: 'builtin_eu_standard',
    name: 'EU Standard (generic)',
    incomeTaxPercent: 20,
    socialSecurityPercent: 10,
    insurancePercent: 2,
  },
};

function daysBetweenInclusive(start: Date, end: Date): number {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function clampDate(d: Date, min: Date, max: Date): Date {
  return new Date(Math.min(Math.max(d.getTime(), min.getTime()), max.getTime()));
}

/** Pro-rata fixed monthly salary for mid-cycle starts and unpaid leave. */
export function calcProRataSalary(
  monthlySalary: number,
  periodStart: Date,
  periodEnd: Date,
  hireDate: Date | null | undefined,
  unpaidLeaveDays = 0,
): ProRataResult {
  const daysInPeriod = daysBetweenInclusive(periodStart, periodEnd);
  const effectiveStart = hireDate
    ? clampDate(hireDate, periodStart, periodEnd)
    : periodStart;
  let daysWorked = daysBetweenInclusive(effectiveStart, periodEnd);
  daysWorked = Math.max(0, daysWorked - Math.max(0, unpaidLeaveDays));
  const proRataFactor = daysWorked / daysInPeriod;
  const proRataSalary = roundMoney(monthlySalary * proRataFactor);
  return {
    fullPeriodSalary: monthlySalary,
    proRataSalary,
    daysInPeriod,
    daysWorked,
    unpaidLeaveDays: Math.max(0, unpaidLeaveDays),
    proRataFactor,
  };
}

export function resolveWorkerType(raw: string | null | undefined): PayrollWorkerType {
  if (raw && raw in BUILTIN_TAX_PROFILES) {
    return raw as PayrollWorkerType;
  }
  if (raw && raw !== 'hourly') return 'custom';
  return 'hourly';
}

export function resolveTaxRatesForWorker(
  workerType: PayrollWorkerType,
  companyRules: TaxRule[] | null | undefined,
  defaultRuleId: string | null | undefined,
): { id: string; name: string; incomeTaxPercent: number; socialSecurityPercent: number; insurancePercent: number } {
  const rules = companyRules ?? [];
  const byWorker = rules.find(
    (r) => r.enabled && (r as TaxRule & { workerType?: string }).workerType === workerType,
  );
  if (byWorker) {
    return {
      id: byWorker.id,
      name: byWorker.name,
      incomeTaxPercent: byWorker.percentage ?? 0,
      socialSecurityPercent: (byWorker as TaxRule & { socialSecurityPercent?: number }).socialSecurityPercent ?? 0,
      insurancePercent: (byWorker as TaxRule & { insurancePercent?: number }).insurancePercent ?? 0,
    };
  }
  if (defaultRuleId) {
    const match = rules.find((r) => r.id === defaultRuleId && r.enabled);
    if (match) {
      return {
        id: match.id,
        name: match.name,
        incomeTaxPercent: match.percentage ?? 0,
        socialSecurityPercent: (match as TaxRule & { socialSecurityPercent?: number }).socialSecurityPercent ?? 0,
        insurancePercent: (match as TaxRule & { insurancePercent?: number }).insurancePercent ?? 0,
      };
    }
  }
  return BUILTIN_TAX_PROFILES[workerType] ?? BUILTIN_TAX_PROFILES.custom;
}

export function applyPayrollTaxProfile(
  grossPay: number,
  workerType: PayrollWorkerType,
  companyRules?: TaxRule[] | null,
  defaultRuleId?: string | null,
  manualOverrides?: { incomeTax?: number; socialSecurity?: number; insurance?: number; other?: number },
): PayrollTaxBreakdown {
  const profile = resolveTaxRatesForWorker(workerType, companyRules, defaultRuleId);
  const incomeTax =
    manualOverrides?.incomeTax != null
      ? manualOverrides.incomeTax
      : roundMoney((grossPay * profile.incomeTaxPercent) / 100);
  const socialSecurity =
    manualOverrides?.socialSecurity != null
      ? manualOverrides.socialSecurity
      : roundMoney((grossPay * profile.socialSecurityPercent) / 100);
  const insurance =
    manualOverrides?.insurance != null
      ? manualOverrides.insurance
      : roundMoney((grossPay * profile.insurancePercent) / 100);
  const otherDeductions = manualOverrides?.other ?? 0;
  const totalDeductions = roundMoney(incomeTax + socialSecurity + insurance + otherDeductions);
  return {
    grossPay: roundMoney(grossPay),
    incomeTax,
    socialSecurity,
    insurance,
    otherDeductions,
    totalDeductions,
    netPay: roundMoney(grossPay - totalDeductions),
    taxProfileId: profile.id,
    taxProfileName: profile.name,
    workerType,
  };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function countUnpaidLeaveDays(
  userId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: 'approved',
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    select: { startDate: true, endDate: true },
  });
  let days = 0;
  for (const leave of leaves) {
    const start = clampDate(leave.startDate, periodStart, periodEnd);
    const end = clampDate(leave.endDate, periodStart, periodEnd);
    days += daysBetweenInclusive(start, end);
  }
  return days;
}
