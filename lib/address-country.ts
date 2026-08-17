import prisma from '@/lib/prisma';

export type AddressCountryOption = {
  code: string;
  label: string;
};

/** ISO 3166-1 alpha-2 codes supported for address autocomplete / geocoding bias. */
export const SUPPORTED_ADDRESS_COUNTRIES: AddressCountryOption[] = [
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'IE', label: 'Ireland' },
  { code: 'AU', label: 'Australia' },
  { code: 'CA', label: 'Canada' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'PT', label: 'Portugal' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'BE', label: 'Belgium' },
  { code: 'PL', label: 'Poland' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NO', label: 'Norway' },
  { code: 'DK', label: 'Denmark' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'AT', label: 'Austria' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'CN', label: 'China' },
];

export const DEFAULT_ADDRESS_COUNTRY = 'GB';

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  GBP: 'GB',
  USD: 'US',
  EUR: 'IE',
  AUD: 'AU',
  CAD: 'CA',
  NZD: 'NZ',
  AED: 'AE',
  SAR: 'SA',
  CNY: 'CN',
  SEK: 'SE',
  NOK: 'NO',
  DKK: 'DK',
  CHF: 'CH',
  PLN: 'PL',
};

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Lisbon': 'PT',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Warsaw': 'PL',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Zurich': 'CH',
  'Europe/Vienna': 'AT',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Pacific/Auckland': 'NZ',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Shanghai': 'CN',
};

export function normalizeAddressCountryCode(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== 2) return null;
  return SUPPORTED_ADDRESS_COUNTRIES.some((c) => c.code === code) ? code : null;
}

export function inferAddressCountryFromSignals(input: {
  currency?: string | null;
  timezone?: string | null;
  deviceRegion?: string | null;
}): string {
  const device = normalizeAddressCountryCode(input.deviceRegion);
  if (device) return device;

  const tz = input.timezone?.trim();
  if (tz && TIMEZONE_TO_COUNTRY[tz]) {
    return TIMEZONE_TO_COUNTRY[tz];
  }

  const currency = input.currency?.trim().toUpperCase();
  if (currency && CURRENCY_TO_COUNTRY[currency]) {
    return CURRENCY_TO_COUNTRY[currency];
  }

  return DEFAULT_ADDRESS_COUNTRY;
}

export async function getCompanyAddressCountry(companyId: number): Promise<string> {
  const config = await prisma.adminConfiguration.findUnique({
    where: { companyId },
    select: { addressCountry: true, currency: true, timezone: true },
  });

  const stored = normalizeAddressCountryCode(config?.addressCountry);
  if (stored) return stored;

  return inferAddressCountryFromSignals({
    currency: config?.currency,
    timezone: config?.timezone,
  });
}

export async function resolveCompanyAddressCountry(
  companyId: number,
  deviceRegion?: string | null
): Promise<{ countryCode: string; autoDetected: boolean; persisted: boolean }> {
  const config = await prisma.adminConfiguration.findUnique({
    where: { companyId },
    select: { addressCountry: true, currency: true, timezone: true },
  });

  const stored = normalizeAddressCountryCode(config?.addressCountry);
  if (stored) {
    return { countryCode: stored, autoDetected: false, persisted: false };
  }

  const inferred = inferAddressCountryFromSignals({
    currency: config?.currency,
    timezone: config?.timezone,
    deviceRegion,
  });

  await prisma.adminConfiguration.upsert({
    where: { companyId },
    create: { companyId, addressCountry: inferred },
    update: { addressCountry: inferred },
  });

  return { countryCode: inferred, autoDetected: true, persisted: true };
}
