import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';

export interface TaxRule {
  id: string;
  name: string;
  percentage: number;
  mode: 'inclusive' | 'exclusive';
  enabled: boolean;
  isDefault: boolean;
  /** Payroll-only: match employee payrollWorkerType */
  workerType?: string;
  socialSecurityPercent?: number;
  insurancePercent?: number;
}

export interface CompanyInvoiceSettingsDTO {
  companyDisplayName: string | null;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxRegistrationNumber: string | null;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  taxEnabled: boolean;
  taxRules: TaxRule[];
  defaultTaxRuleId: string | null;
  payrollPrefix: string;
  nextPayrollNumber: number;
  payrollTaxEnabled: boolean;
  payrollTaxRules: TaxRule[];
  payrollDefaultTaxRuleId: string | null;
  invoiceLanguage: string;
}

const DEFAULT_SETTINGS: CompanyInvoiceSettingsDTO = {
  companyDisplayName: null,
  logoUrl: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  taxRegistrationNumber: null,
  invoicePrefix: 'INV-',
  nextInvoiceNumber: 1,
  taxEnabled: false,
  taxRules: [],
  defaultTaxRuleId: null,
  payrollPrefix: 'PAY-',
  nextPayrollNumber: 1,
  payrollTaxEnabled: false,
  payrollTaxRules: [],
  payrollDefaultTaxRuleId: null,
  invoiceLanguage: 'en',
};

function prismaCreateDefaults(companyId: number) {
  return {
    companyId,
    companyDisplayName: DEFAULT_SETTINGS.companyDisplayName,
    logoUrl: DEFAULT_SETTINGS.logoUrl,
    address: DEFAULT_SETTINGS.address,
    phone: DEFAULT_SETTINGS.phone,
    email: DEFAULT_SETTINGS.email,
    website: DEFAULT_SETTINGS.website,
    taxRegistrationNumber: DEFAULT_SETTINGS.taxRegistrationNumber,
    invoicePrefix: DEFAULT_SETTINGS.invoicePrefix,
    nextInvoiceNumber: DEFAULT_SETTINGS.nextInvoiceNumber,
    taxEnabled: DEFAULT_SETTINGS.taxEnabled,
    taxRules: serializeTaxRules(DEFAULT_SETTINGS.taxRules),
    defaultTaxRuleId: DEFAULT_SETTINGS.defaultTaxRuleId,
    payrollPrefix: DEFAULT_SETTINGS.payrollPrefix,
    nextPayrollNumber: DEFAULT_SETTINGS.nextPayrollNumber,
    payrollTaxEnabled: DEFAULT_SETTINGS.payrollTaxEnabled,
    payrollTaxRules: serializeTaxRules(DEFAULT_SETTINGS.payrollTaxRules),
    payrollDefaultTaxRuleId: DEFAULT_SETTINGS.payrollDefaultTaxRuleId,
    invoiceLanguage: DEFAULT_SETTINGS.invoiceLanguage,
  };
}

export function parseTaxRules(raw: string | null | undefined): TaxRule[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.name === 'string')
      .map((r) => ({
        id: r.id || randomUUID(),
        name: String(r.name),
        percentage: Number(r.percentage) || 0,
        mode: r.mode === 'inclusive' ? 'inclusive' : 'exclusive',
        enabled: r.enabled !== false,
        isDefault: !!r.isDefault,
        ...(r.workerType ? { workerType: String(r.workerType) } : {}),
        ...(r.socialSecurityPercent != null
          ? { socialSecurityPercent: Number(r.socialSecurityPercent) || 0 }
          : {}),
        ...(r.insurancePercent != null
          ? { insurancePercent: Number(r.insurancePercent) || 0 }
          : {}),
      }));
  } catch {
    return [];
  }
}

export function serializeTaxRules(rules: TaxRule[]): string {
  return JSON.stringify(rules);
}

export function toSettingsDTO(
  row: {
    companyDisplayName: string | null;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    taxRegistrationNumber: string | null;
    invoicePrefix: string;
    nextInvoiceNumber: number;
    taxEnabled: boolean;
    taxRules: string;
    defaultTaxRuleId: string | null;
  } | null,
  companyName?: string
): CompanyInvoiceSettingsDTO {
  if (!row) {
    return { ...DEFAULT_SETTINGS, companyDisplayName: companyName || null };
  }
  return {
    companyDisplayName: row.companyDisplayName ?? companyName ?? null,
    logoUrl: row.logoUrl,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    taxRegistrationNumber: row.taxRegistrationNumber,
    invoicePrefix: row.invoicePrefix || 'INV-',
    nextInvoiceNumber: row.nextInvoiceNumber || 1,
    taxEnabled: row.taxEnabled,
    taxRules: parseTaxRules(row.taxRules),
    defaultTaxRuleId: row.defaultTaxRuleId,
    payrollPrefix: (row as { payrollPrefix?: string }).payrollPrefix || 'PAY-',
    nextPayrollNumber: (row as { nextPayrollNumber?: number }).nextPayrollNumber ?? 1,
    payrollTaxEnabled: !!(row as { payrollTaxEnabled?: boolean }).payrollTaxEnabled,
    payrollTaxRules: parseTaxRules((row as { payrollTaxRules?: string }).payrollTaxRules),
    payrollDefaultTaxRuleId: (row as { payrollDefaultTaxRuleId?: string | null }).payrollDefaultTaxRuleId ?? null,
    invoiceLanguage: (row as { invoiceLanguage?: string }).invoiceLanguage || 'en',
  };
}

export async function getCompanyInvoiceSettings(companyId: number): Promise<CompanyInvoiceSettingsDTO> {
  const [settings, company] = await Promise.all([
    prisma.companyInvoiceSettings.findUnique({ where: { companyId } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  return toSettingsDTO(settings, company?.name);
}

export async function upsertCompanyInvoiceSettings(
  companyId: number,
  input: Partial<CompanyInvoiceSettingsDTO>
) {
  const existing = await prisma.companyInvoiceSettings.findUnique({ where: { companyId } });

  let taxRules = input.taxRules;
  if (taxRules) {
    const defaultId = taxRules.find((r) => r.isDefault)?.id;
    taxRules = taxRules.map((r) => ({
      ...r,
      id: r.id || randomUUID(),
      isDefault: defaultId ? r.id === defaultId : r.isDefault,
    }));
    if (!taxRules.some((r) => r.isDefault) && taxRules.length > 0) {
      taxRules[0].isDefault = true;
    }
  }

  const data = {
    ...(input.companyDisplayName !== undefined ? { companyDisplayName: input.companyDisplayName } : {}),
    ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.website !== undefined ? { website: input.website } : {}),
    ...(input.taxRegistrationNumber !== undefined
      ? { taxRegistrationNumber: input.taxRegistrationNumber }
      : {}),
    ...(input.invoicePrefix !== undefined ? { invoicePrefix: input.invoicePrefix || 'INV-' } : {}),
    ...(input.nextInvoiceNumber !== undefined
      ? { nextInvoiceNumber: Math.max(1, Number(input.nextInvoiceNumber) || 1) }
      : {}),
    ...(input.taxEnabled !== undefined ? { taxEnabled: !!input.taxEnabled } : {}),
    ...(taxRules ? { taxRules: serializeTaxRules(taxRules) } : {}),
    ...(input.defaultTaxRuleId !== undefined ? { defaultTaxRuleId: input.defaultTaxRuleId } : {}),
    ...(input.payrollPrefix !== undefined ? { payrollPrefix: input.payrollPrefix || 'PAY-' } : {}),
    ...(input.nextPayrollNumber !== undefined
      ? { nextPayrollNumber: Math.max(1, Number(input.nextPayrollNumber) || 1) }
      : {}),
    ...(input.payrollTaxEnabled !== undefined ? { payrollTaxEnabled: !!input.payrollTaxEnabled } : {}),
    ...(input.payrollTaxRules
      ? { payrollTaxRules: serializeTaxRules(input.payrollTaxRules) }
      : {}),
    ...(input.payrollDefaultTaxRuleId !== undefined
      ? { payrollDefaultTaxRuleId: input.payrollDefaultTaxRuleId }
      : {}),
    ...(input.invoiceLanguage !== undefined
      ? { invoiceLanguage: input.invoiceLanguage || 'en' }
      : {}),
  };

  const saved = await prisma.companyInvoiceSettings.upsert({
    where: { companyId },
    create: { ...prismaCreateDefaults(companyId), ...data },
    update: data,
  });

  if (
    input.invoiceLanguage !== undefined &&
    existing &&
    (existing as { invoiceLanguage?: string }).invoiceLanguage !== input.invoiceLanguage
  ) {
    await prisma.payrollRecord.updateMany({
      where: { companyId },
      data: { invoiceUrl: null },
    });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  return toSettingsDTO(saved, company?.name);
}

export async function allocateInvoiceNumber(companyId: number): Promise<string> {
  return prisma.$transaction(async (tx) => {
    let settings = await tx.companyInvoiceSettings.findUnique({ where: { companyId } });
    if (!settings) {
      settings = await tx.companyInvoiceSettings.create({
        data: { companyId },
      });
    }
    const num = settings.nextInvoiceNumber;
    const prefix = settings.invoicePrefix || 'INV-';
    await tx.companyInvoiceSettings.update({
      where: { companyId },
      data: { nextInvoiceNumber: num + 1 },
    });
    const year = new Date().getFullYear();
    return `${prefix}${year}-${String(num).padStart(4, '0')}`;
  });
}

export function resolveActiveTaxRule(settings: CompanyInvoiceSettingsDTO): TaxRule | null {
  if (!settings.taxEnabled || settings.taxRules.length === 0) return null;
  const enabled = settings.taxRules.filter((r) => r.enabled);
  if (enabled.length === 0) return null;
  if (settings.defaultTaxRuleId) {
    const match = enabled.find((r) => r.id === settings.defaultTaxRuleId);
    if (match) return match;
  }
  return enabled.find((r) => r.isDefault) || enabled[0];
}

export function resolveActivePayrollTaxRule(settings: CompanyInvoiceSettingsDTO): TaxRule | null {
  if (!settings.payrollTaxEnabled || settings.payrollTaxRules.length === 0) return null;
  const enabled = settings.payrollTaxRules.filter((r) => r.enabled);
  if (enabled.length === 0) return null;
  if (settings.payrollDefaultTaxRuleId) {
    const match = enabled.find((r) => r.id === settings.payrollDefaultTaxRuleId);
    if (match) return match;
  }
  return enabled.find((r) => r.isDefault) || enabled[0];
}

export async function allocatePayrollNumber(companyId: number): Promise<string> {
  return prisma.$transaction(async (tx) => {
    let settings = await tx.companyInvoiceSettings.findUnique({ where: { companyId } });
    if (!settings) {
      settings = await tx.companyInvoiceSettings.create({ data: { companyId } });
    }
    const num = (settings as { nextPayrollNumber?: number }).nextPayrollNumber ?? 1;
    const prefix = (settings as { payrollPrefix?: string }).payrollPrefix || 'PAY-';
    await tx.companyInvoiceSettings.update({
      where: { companyId },
      data: { nextPayrollNumber: num + 1 } as any,
    });
    const year = new Date().getFullYear();
    return `${prefix}${year}-${String(num).padStart(4, '0')}`;
  });
}

export function calcTotalsWithTax(
  subtotal: number,
  taxRule: TaxRule | null
): { subtotal: number; taxRate: number; taxAmount: number; totalAmount: number } {
  if (!taxRule || taxRule.percentage <= 0) {
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: Math.round(subtotal * 100) / 100,
    };
  }

  const rate = taxRule.percentage;
  if (taxRule.mode === 'inclusive') {
    const totalAmount = Math.round(subtotal * 100) / 100;
    const taxAmount = Math.round((totalAmount - totalAmount / (1 + rate / 100)) * 100) / 100;
    const netSubtotal = Math.round((totalAmount - taxAmount) * 100) / 100;
    return { subtotal: netSubtotal, taxRate: rate, taxAmount, totalAmount };
  }

  const netSubtotal = Math.round(subtotal * 100) / 100;
  const taxAmount = Math.round(netSubtotal * (rate / 100) * 100) / 100;
  const totalAmount = Math.round((netSubtotal + taxAmount) * 100) / 100;
  return { subtotal: netSubtotal, taxRate: rate, taxAmount, totalAmount };
}
