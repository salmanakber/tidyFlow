export type PlanTier = 'STARTUP' | 'STANDARD' | 'PREMIUM';

/** Must match mobile/src/constants/iosIapProducts.ts */
export const APPLE_IAP_PRODUCTS: Record<PlanTier, string> = {
  STARTUP: 'com.tidyflow.mobile.startup.monthly',
  STANDARD: 'com.tidyflow.mobile.standard.monthly',
  PREMIUM: 'com.tidyflow.mobile.premium.monthly',
};

export const APPLE_PRODUCT_TO_TIER: Record<string, PlanTier> = Object.fromEntries(
  Object.entries(APPLE_IAP_PRODUCTS).map(([tier, productId]) => [productId, tier as PlanTier])
) as Record<string, PlanTier>;

export function resolvePlanTierFromAppleProduct(
  productId: string,
  fallbackTier?: string | null
): PlanTier | null {
  if (APPLE_PRODUCT_TO_TIER[productId]) return APPLE_PRODUCT_TO_TIER[productId];
  const upper = (fallbackTier || '').toUpperCase();
  if (upper === 'STARTUP' || upper === 'STANDARD' || upper === 'PREMIUM') {
    return upper;
  }
  return null;
}

/** Decode StoreKit 2 JWS payload without full certificate chain verify (payload inspection). */
export function decodeAppleJwsPayload(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function appleSubscriptionId(originalTransactionId: string): string {
  return `apple:${originalTransactionId}`;
}

export function parseAppleSubscriptionId(subscriptionId: string | null | undefined): string | null {
  if (!subscriptionId?.startsWith('apple:')) return null;
  return subscriptionId.slice('apple:'.length);
}
