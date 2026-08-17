import prisma from '@/lib/prisma';
import { getCompanyInvoiceSettings } from '@/lib/invoice-settings';
import {
  applyPayrollTaxProfile,
  resolveWorkerType,
} from '@/lib/payroll-calculations';

export type PayrollRuleType = 'allowance' | 'deduction';

export interface PayrollRuleInput {
  name: string;
  type: PayrollRuleType;
  amount: number;
  effectiveStart: Date | string;
  effectiveEnd?: Date | string | null;
  status?: 'active' | 'inactive';
  description?: string | null;
}

export interface OneTimeLineItemInput {
  name: string;
  type: PayrollRuleType;
  amount: number;
  description?: string | null;
}

export interface PayrollLineItemSnapshot {
  sourceRuleId?: number | null;
  name: string;
  type: PayrollRuleType;
  amount: number;
  isRecurring: boolean;
  description?: string | null;
}

/** Rule applies when payroll period overlaps its effective window. */
export function ruleAppliesToPeriod(
  rule: { effectiveStart: Date; effectiveEnd: Date | null; status: string },
  periodStart: Date,
  periodEnd: Date,
): boolean {
  if (rule.status !== 'active') return false;
  const start = new Date(rule.effectiveStart);
  start.setHours(0, 0, 0, 0);
  const end = rule.effectiveEnd ? new Date(rule.effectiveEnd) : null;
  if (end) end.setHours(23, 59, 59, 999);
  const pStart = new Date(periodStart);
  pStart.setHours(0, 0, 0, 0);
  const pEnd = new Date(periodEnd);
  pEnd.setHours(23, 59, 59, 999);
  if (start > pEnd) return false;
  if (end && end < pStart) return false;
  return true;
}

export async function findActiveRulesForPeriod(
  userId: number,
  companyId: number,
  periodStart: Date,
  periodEnd: Date,
) {
  const rules = await prisma.employeePayrollRule.findMany({
    where: { userId, companyId, status: 'active' },
    orderBy: [{ effectiveStart: 'asc' }, { id: 'asc' }],
  });
  return rules.filter((r) => ruleAppliesToPeriod(r, periodStart, periodEnd));
}

export function rulesToSnapshots(rules: Array<{
  id: number;
  name: string;
  type: string;
  amount: unknown;
  description: string | null;
}>): PayrollLineItemSnapshot[] {
  return rules.map((r) => ({
    sourceRuleId: r.id,
    name: r.name,
    type: r.type as PayrollRuleType,
    amount: Number(r.amount),
    isRecurring: true,
    description: r.description,
  }));
}

export function sumLineItemsByType(
  items: Array<{ type: string; amount: unknown }>,
  type: PayrollRuleType,
): number {
  return items
    .filter((i) => i.type === type)
    .reduce((sum, i) => sum + Number(i.amount), 0);
}

export interface RecalcInput {
  payrollType: string;
  hoursWorked: number | null;
  hourlyRate: number | null;
  fixedSalary: number | null;
  overtimeAmount?: number | null;
  payrollWorkerType?: string | null;
  companyId: number;
  useAutoTax?: boolean;
}

export interface RecalcResult {
  grossSalary: number;
  totalAllowances: number;
  totalRuleDeductions: number;
  incomeTax: number;
  socialSecurity: number;
  insurance: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
}

export function calcBasePay(input: RecalcInput): number {
  if (input.payrollType === 'fixed') {
    return Number(input.fixedSalary || 0);
  }
  const hrs = Number(input.hoursWorked || 0);
  const rate = Number(input.hourlyRate || 0);
  return hrs * rate;
}

export function recalcPayrollTotals(
  lineItems: Array<{ type: string; amount: unknown }>,
  input: RecalcInput,
  taxRules?: Parameters<typeof applyPayrollTaxProfile>[2],
  defaultTaxRuleId?: string | null,
  payrollTaxEnabled?: boolean,
): RecalcResult {
  const basePay = calcBasePay(input);
  const overtimeAmount = Number(input.overtimeAmount || 0);
  const totalAllowances = sumLineItemsByType(lineItems, 'allowance');
  const totalRuleDeductions = sumLineItemsByType(lineItems, 'deduction');
  const grossSalary = basePay + overtimeAmount + totalAllowances;

  let incomeTax = 0;
  let socialSecurity = 0;
  let insurance = 0;
  let otherDeductions = 0;

  const useAutoTax = input.useAutoTax !== false;
  if (useAutoTax) {
    const workerType = resolveWorkerType(input.payrollWorkerType);
    const taxBreakdown =
      payrollTaxEnabled && taxRules
        ? applyPayrollTaxProfile(grossSalary, workerType, taxRules, defaultTaxRuleId)
        : applyPayrollTaxProfile(grossSalary, workerType);
    incomeTax = taxBreakdown.incomeTax;
    socialSecurity = taxBreakdown.socialSecurity;
    insurance = taxBreakdown.insurance;
    otherDeductions = taxBreakdown.otherDeductions;
  }

  const totalDeductions = incomeTax + socialSecurity + insurance + otherDeductions + totalRuleDeductions;
  const netSalary = Math.max(0, grossSalary - totalDeductions);

  return {
    grossSalary: parseFloat(grossSalary.toFixed(2)),
    totalAllowances: parseFloat(totalAllowances.toFixed(2)),
    totalRuleDeductions: parseFloat(totalRuleDeductions.toFixed(2)),
    incomeTax: parseFloat(incomeTax.toFixed(2)),
    socialSecurity: parseFloat(socialSecurity.toFixed(2)),
    insurance: parseFloat(insurance.toFixed(2)),
    otherDeductions: parseFloat(otherDeductions.toFixed(2)),
    totalDeductions: parseFloat(totalDeductions.toFixed(2)),
    netSalary: parseFloat(netSalary.toFixed(2)),
  };
}

/** Sync legacy summary columns from line items + base pay (backward compat for PDF/list). */
export function legacySummaryFromRecalc(
  totals: RecalcResult,
  lineItems: Array<{ name: string; type: string; amount: unknown }>,
) {
  const bonus = lineItems
    .filter((i) => i.type === 'allowance' && /bonus/i.test(i.name))
    .reduce((s, i) => s + Number(i.amount), 0);
  const transport = lineItems
    .filter((i) => i.type === 'allowance' && /travel|transport/i.test(i.name))
    .reduce((s, i) => s + Number(i.amount), 0);
  const hra = lineItems
    .filter((i) => i.type === 'allowance' && /hra|housing/i.test(i.name))
    .reduce((s, i) => s + Number(i.amount), 0);
  const otherAllow = totals.totalAllowances - bonus - transport - hra;
  const loan = lineItems
    .filter((i) => i.type === 'deduction' && /loan/i.test(i.name))
    .reduce((s, i) => s + Number(i.amount), 0);
  const otherDed = totals.totalRuleDeductions - loan;

  return {
    grossSalary: totals.grossSalary,
    netSalary: totals.netSalary,
    totalDeductions: totals.totalDeductions,
    totalAmount: totals.netSalary,
    incomeTax: totals.incomeTax || null,
    socialSecurity: totals.socialSecurity || null,
    insurance: totals.insurance || null,
    otherDeductions: totals.otherDeductions + otherDed || null,
    loanRepayment: loan || null,
    bonus: bonus || null,
    transportAllowance: transport || null,
    hraAllowance: hra || null,
    otherAllowances: otherAllow > 0 ? otherAllow : null,
  };
}

export async function createLineItemsForPayroll(
  payrollRecordId: number,
  snapshots: PayrollLineItemSnapshot[],
) {
  if (snapshots.length === 0) return [];
  const created = [];
  for (const s of snapshots) {
    const item = await prisma.payrollLineItem.create({
      data: {
        payrollRecordId,
        sourceRuleId: s.sourceRuleId ?? null,
        name: s.name,
        type: s.type,
        amount: s.amount,
        isRecurring: s.isRecurring,
        description: s.description ?? null,
      },
    });
    created.push(item);
  }
  return created;
}

export async function recalculateAndUpdatePayrollRecord(payrollRecordId: number) {
  const record = await prisma.payrollRecord.findUnique({
    where: { id: payrollRecordId },
    include: {
      lineItems: true,
      user: { select: { payrollWorkerType: true } },
    },
  });
  if (!record) throw new Error('Payroll record not found');

  const settings = await getCompanyInvoiceSettings(record.companyId);
  const totals = recalcPayrollTotals(
    record.lineItems,
    {
      payrollType: record.payrollType,
      hoursWorked: record.hoursWorked != null ? Number(record.hoursWorked) : null,
      hourlyRate: record.hourlyRate != null ? Number(record.hourlyRate) : null,
      fixedSalary: record.fixedSalary != null ? Number(record.fixedSalary) : null,
      overtimeAmount: record.overtimeAmount != null ? Number(record.overtimeAmount) : null,
      payrollWorkerType: record.user.payrollWorkerType,
      companyId: record.companyId,
    },
    settings.payrollTaxRules,
    settings.payrollDefaultTaxRuleId,
    settings.payrollTaxEnabled,
  );

  const legacy = legacySummaryFromRecalc(totals, record.lineItems);

  const updated = await prisma.payrollRecord.update({
    where: { id: payrollRecordId },
    data: legacy,
  });

  return { record: updated, totals, lineItems: record.lineItems };
}

export function validateRuleInput(body: Record<string, unknown>): string | null {
  const name = String(body.name || '').trim();
  if (!name) return 'name is required';
  const type = String(body.type || '');
  if (type !== 'allowance' && type !== 'deduction') return 'type must be allowance or deduction';
  const amount = Number(body.amount);
  if (!amount || amount <= 0 || Number.isNaN(amount)) return 'amount must be a positive number';
  if (!body.effectiveStart) return 'effectiveStart is required';
  const status = body.status != null ? String(body.status) : 'active';
  if (status !== 'active' && status !== 'inactive') return 'status must be active or inactive';
  if (body.effectiveEnd && body.effectiveStart) {
    const start = new Date(String(body.effectiveStart));
    const end = new Date(String(body.effectiveEnd));
    if (end < start) return 'effectiveEnd must be on or after effectiveStart';
  }
  return null;
}

export function serializeRule(rule: {
  id: number;
  userId: number;
  companyId: number;
  name: string;
  type: string;
  amount: unknown;
  effectiveStart: Date;
  effectiveEnd: Date | null;
  status: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: rule.id,
    userId: rule.userId,
    companyId: rule.companyId,
    name: rule.name,
    type: rule.type,
    amount: Number(rule.amount),
    effectiveStart: rule.effectiveStart.toISOString(),
    effectiveEnd: rule.effectiveEnd?.toISOString() ?? null,
    status: rule.status,
    description: rule.description,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function serializeLineItem(item: {
  id: number;
  payrollRecordId: number;
  sourceRuleId: number | null;
  name: string;
  type: string;
  amount: unknown;
  isRecurring: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    payrollRecordId: item.payrollRecordId,
    sourceRuleId: item.sourceRuleId,
    name: item.name,
    type: item.type,
    amount: Number(item.amount),
    isRecurring: item.isRecurring,
    description: item.description,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
