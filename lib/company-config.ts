import prisma from '@/lib/prisma';
import { DEFAULT_CURRENCY, normalizeCurrencyCode } from '@/lib/stripe-currencies';

export async function getCompanyCurrency(companyId: number): Promise<string> {
  const config = await prisma.adminConfiguration.findUnique({
    where: { companyId },
    select: { currency: true },
  });
  return normalizeCurrencyCode(config?.currency);
}

export function currencySymbol(code: string): string {
  const normalized = normalizeCurrencyCode(code);
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: normalized }).formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency')?.value;
    if (sym && sym !== normalized) return sym;
  } catch {
    /* fall through */
  }
  return `${normalized} `;
}
