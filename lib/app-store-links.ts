/** App store download links for public subscribe success. */
export function getIosAppStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_IOS_APP_STORE_URL?.trim() ||
    'https://apps.apple.com/search?term=TidyFlow'
  );
}

export function getAndroidPlayStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL?.trim() ||
    'https://play.google.com/store/apps/details?id=com.tidyflow.mobile'
  );
}

export function getSubscribePlanPath(tier: string): string {
  return `/subscribe/${String(tier || '').toLowerCase()}`;
}

export const PUBLIC_PLAN_SLUGS = ['startup', 'standard', 'premium'] as const;
export type PublicPlanSlug = (typeof PUBLIC_PLAN_SLUGS)[number];

export function normalizePublicPlanSlug(raw: string | null | undefined): PublicPlanSlug | null {
  const slug = String(raw || '')
    .trim()
    .toLowerCase();
  if (slug === 'startup' || slug === 'standard' || slug === 'premium') return slug;
  return null;
}

export function planSlugToTier(slug: string): 'STARTUP' | 'STANDARD' | 'PREMIUM' | null {
  const normalized = normalizePublicPlanSlug(slug);
  if (!normalized) return null;
  return normalized.toUpperCase() as 'STARTUP' | 'STANDARD' | 'PREMIUM';
}
