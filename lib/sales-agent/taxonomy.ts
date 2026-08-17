/** App languages — mirrors mobile/src/i18n SUPPORTED_LANGUAGES */
export const SA_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
  { code: 'cn', label: '中文' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pl', label: 'Polski' },
  { code: 'no', label: 'Norsk' },
  { code: 'sv', label: 'Svenska' },
  { code: 'it', label: 'Italiano' },
] as const;

export type SaLanguageCode = (typeof SA_LANGUAGES)[number]['code'];

/** Common outreach markets (optional tagging — not a hard filter on sends) */
export const SA_COUNTRIES = [
  'United Arab Emirates',
  'Saudi Arabia',
  'United Kingdom',
  'United States',
  'Germany',
  'France',
  'Spain',
  'Portugal',
  'Italy',
  'Netherlands',
  'Belgium',
  'Switzerland',
  'Austria',
  'Sweden',
  'Norway',
  'Denmark',
  'Poland',
  'Ireland',
  'Canada',
  'Australia',
  'New Zealand',
  'Brazil',
  'Mexico',
  'India',
  'Singapore',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'Egypt',
  'South Africa',
  'China',
] as const;

export function languageLabel(code?: string | null): string {
  if (!code) return '';
  const hit = SA_LANGUAGES.find((l) => l.code === code);
  return hit ? hit.label : code;
}

export function formatAudienceTag(opts: {
  language?: string | null;
  country?: string | null;
}): string {
  const parts: string[] = [];
  const lang = languageLabel(opts.language);
  if (lang) parts.push(lang);
  if (opts.country) parts.push(opts.country);
  return parts.join(' · ');
}
