import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/stripe';

export const STRIPE_SETTING_KEYS = {
  secretKey: 'stripe_secret_key',
  publishableKey: 'stripe_publishable_key',
  priceStartup: 'stripe_price_id_startup',
  priceStandard: 'stripe_price_id_standard',
  pricePremium: 'stripe_price_id_premium',
  /** @deprecated use per-tier price IDs */
  basePriceId: 'stripe_base_price_id',
  propertyPriceId: 'stripe_property_price_id',
} as const;

export type StripePlanTier = 'STARTUP' | 'STANDARD' | 'PREMIUM';

const TIER_PRICE_KEY: Record<StripePlanTier, string> = {
  STARTUP: STRIPE_SETTING_KEYS.priceStartup,
  STANDARD: STRIPE_SETTING_KEYS.priceStandard,
  PREMIUM: STRIPE_SETTING_KEYS.pricePremium,
};

const TIER_ENV_FALLBACK: Record<StripePlanTier, string[]> = {
  STARTUP: ['STRIPE_PRICE_ID_STARTUP', 'STRIPE_PRICE_STARTUP'],
  STANDARD: ['STRIPE_PRICE_ID_STANDARD', 'STRIPE_PRICE_ID_BASE_55_PRICE', 'STRIPE_BASE_PRICE_ID'],
  PREMIUM: ['STRIPE_PRICE_ID_PREMIUM', 'STRIPE_PRICE_PREMIUM'],
};

export async function getStripeSetting(key: string): Promise<string> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    if (setting?.value) {
      return setting.isEncrypted ? decrypt(setting.value) : setting.value;
    }
  } catch (error) {
    console.warn(`Failed to read Stripe setting ${key}:`, error);
  }
  return '';
}

export async function setStripeSetting(
  key: string,
  value: string,
  options?: { encrypted?: boolean }
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value,
      isEncrypted: options?.encrypted ?? false,
      category: 'stripe',
    },
    update: {
      value,
      isEncrypted: options?.encrypted ?? false,
      category: 'stripe',
    },
  });
}

export async function getStripeSecretKey(): Promise<string> {
  const fromDb = await getStripeSetting(STRIPE_SETTING_KEYS.secretKey);
  return fromDb || process.env.STRIPE_SECRET_KEY || '';
}

export async function getStripePublishableKey(): Promise<string> {
  const fromDb = await getStripeSetting(STRIPE_SETTING_KEYS.publishableKey);
  return fromDb || process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
}

export async function getStripePriceIdForTier(tier: string, currency = 'USD'): Promise<string> {
  const normalized = tier.toUpperCase() as StripePlanTier;
  if (!TIER_PRICE_KEY[normalized]) return '';

  const cur = currency.toUpperCase();

  const currencySpecificKey = `${TIER_PRICE_KEY[normalized]}_${cur.toLowerCase()}`;
  const fromDbCurrency = await getStripeSetting(currencySpecificKey);
  if (fromDbCurrency) return fromDbCurrency;

  const currencyEnvKey = `STRIPE_PRICE_ID_${normalized}_${cur}`;
  if (process.env[currencyEnvKey]) return process.env[currencyEnvKey]!;

  const fromDb = await getStripeSetting(TIER_PRICE_KEY[normalized]);
  if (fromDb) return fromDb;

  for (const envKey of TIER_ENV_FALLBACK[normalized]) {
    const val = process.env[envKey];
    if (val) return val;
  }

  if (normalized === 'STANDARD') {
    return (
      (await getStripeSetting(STRIPE_SETTING_KEYS.basePriceId)) ||
      process.env.STRIPE_PRICE_ID_BASE_55_PRICE ||
      process.env.STRIPE_BASE_PRICE_ID ||
      ''
    );
  }

  return '';
}

export async function getAllStripeSettingsForAdmin() {
  const keys = Object.values(STRIPE_SETTING_KEYS);
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.isEncrypted ? '••••••••' : row.value;
  }
  return {
    stripe_secret_key: map[STRIPE_SETTING_KEYS.secretKey] || '',
    stripe_publishable_key: map[STRIPE_SETTING_KEYS.publishableKey] || '',
    stripe_price_id_startup: map[STRIPE_SETTING_KEYS.priceStartup] || '',
    stripe_price_id_standard: map[STRIPE_SETTING_KEYS.priceStandard] || '',
    stripe_price_id_premium: map[STRIPE_SETTING_KEYS.pricePremium] || '',
    stripe_base_price_id: map[STRIPE_SETTING_KEYS.basePriceId] || '',
    stripe_property_price_id: map[STRIPE_SETTING_KEYS.propertyPriceId] || '',
  };
}
