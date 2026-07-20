import prisma from '@/lib/prisma';
import { normalizeWebsite } from './discovery';

/** Aggregator / directory hosts — not direct cleaning businesses. */
export const DIRECTORY_HOSTS = new Set([
  'yelp.com',
  'www.yelp.com',
  'yellowpages.com',
  'www.yellowpages.com',
  'yp.com',
  'angi.com',
  'www.angi.com',
  'homeadvisor.com',
  'www.homeadvisor.com',
  'bbb.org',
  'www.bbb.org',
  'thumbtack.com',
  'www.thumbtack.com',
  'trustpilot.com',
  'www.trustpilot.com',
  'facebook.com',
  'www.facebook.com',
  'linkedin.com',
  'www.linkedin.com',
  'instagram.com',
  'www.instagram.com',
  'twitter.com',
  'x.com',
  'www.x.com',
  'pinterest.com',
  'nextdoor.com',
  'www.nextdoor.com',
  'bark.com',
  'www.bark.com',
  'checkatrade.com',
  'www.checkatrade.com',
  'mybuilder.com',
  'www.mybuilder.com',
  'houzz.com',
  'www.houzz.com',
  'manta.com',
  'www.manta.com',
  'superpages.com',
  'www.superpages.com',
  'citysearch.com',
  'cylex.us',
  'cylex.co.uk',
  'hotfrog.com',
  'hotfrog.co.uk',
  'yell.com',
  'www.yell.com',
  '192.com',
  'foursquare.com',
  'tripadvisor.com',
  'wikipedia.org',
  'wikidata.org',
  'duckduckgo.com',
  'google.com',
  'bing.com',
  'amazon.com',
  'ebay.com',
  'indeed.com',
  'glassdoor.com',
  'zoominfo.com',
  'crunchbase.com',
  'clutch.co',
  'sortlist.com',
  'goodfirms.co',
  'expertise.com',
  'porch.com',
  'buildzoom.com',
  'networx.com',
  'care.com',
  'taskrabbit.com',
]);

export function normalizeEmail(email?: string | null): string | null {
  const e = String(email || '')
    .trim()
    .toLowerCase();
  return e.includes('@') ? e : null;
}

export function normalizePhone(phone?: string | null): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-10) : null;
}

export function isDirectoryHost(host?: string | null): boolean {
  if (!host) return true;
  const h = host.toLowerCase().replace(/^www\./, '');
  if (DIRECTORY_HOSTS.has(h) || DIRECTORY_HOSTS.has(`www.${h}`)) return true;
  for (const d of DIRECTORY_HOSTS) {
    if (h === d.replace(/^www\./, '') || h.endsWith(`.${d.replace(/^www\./, '')}`)) return true;
  }
  return false;
}

export function isGoogleMapsUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('google.com/maps') ||
    u.includes('maps.google.com') ||
    u.includes('maps.app.goo.gl') ||
    u.includes('goo.gl/maps')
  );
}

export function parseGoogleMapsPlace(url: string): {
  placeId?: string;
  name?: string;
  mapsUrl: string;
} {
  const mapsUrl = url.split('?')[0];
  let placeId: string | undefined;
  const placeIdMatch = url.match(/[?&]place_id=(ChIJ[^&]+)/i) || url.match(/!1s(ChIJ[^!&]+)/i);
  if (placeIdMatch) placeId = placeIdMatch[1];

  let name: string | undefined;
  const nameMatch = mapsUrl.match(/\/maps\/place\/([^/@]+)/i);
  if (nameMatch) {
    try {
      name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')).trim();
    } catch {
      name = nameMatch[1].replace(/\+/g, ' ').trim();
    }
  }

  return { placeId, name, mapsUrl };
}

export function looksLikeCleaningBusiness(text: string, keyword: string): boolean {
  const t = `${text} ${keyword}`.toLowerCase();
  const signals = [
    'clean',
    'janitor',
    'maid',
    'housekeep',
    'sanit',
    'disinfect',
    'carpet',
    'window clean',
    'commercial clean',
    'office clean',
    'domestic clean',
    'facilities',
    'pressure wash',
  ];
  return signals.some((s) => t.includes(s));
}

export function buildSearchQueries(input: {
  keyword: string;
  city?: string;
  state?: string;
  country?: string;
  profileOnly?: boolean;
  chunkIndex?: number;
}): string[] {
  const loc = [input.city, input.state, input.country].filter(Boolean).join(' ');
  const base = `${input.keyword} ${loc}`.trim();
  const idx = input.chunkIndex ?? 0;

  if (input.profileOnly) {
    const variants = [
      `${base} cleaning company site:google.com/maps`,
      `${base} janitorial services site:google.com/maps/place`,
      `"${input.keyword}" ${loc} commercial cleaning maps`,
    ];
    return [variants[idx % variants.length]];
  }

  const neg =
    '-site:yelp.com -site:yellowpages.com -site:angi.com -site:homeadvisor.com -site:bbb.org -site:thumbtack.com -site:facebook.com -site:linkedin.com -site:trustpilot.com -site:checkatrade.com -site:mybuilder.com';
  const expansions = [
    `${base} cleaning company ${neg}`,
    `${base} commercial janitorial ${neg}`,
    `${base} office cleaning services ${neg}`,
    `${base} residential cleaning ${neg}`,
  ];
  return [expansions[idx % expansions.length]];
}

export type LeadFingerprints = {
  domains: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
  placeIds: Set<string>;
};

export async function loadLeadFingerprints(opts?: {
  country?: string;
  limit?: number;
}): Promise<LeadFingerprints> {
  const where: Record<string, unknown> = {};
  if (opts?.country) {
    where.country = { equals: opts.country, mode: 'insensitive' };
  }

  const rows = await (prisma as any).saLeadCompany.findMany({
    where,
    select: {
      websiteNormalized: true,
      email: true,
      phone: true,
      googlePlaceId: true,
    },
    take: opts?.limit ?? 5000,
    orderBy: { createdAt: 'desc' },
  });

  const domains = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();
  const placeIds = new Set<string>();

  for (const r of rows) {
    if (r.websiteNormalized) domains.add(String(r.websiteNormalized).toLowerCase());
    const em = normalizeEmail(r.email);
    if (em) emails.add(em);
    const ph = normalizePhone(r.phone);
    if (ph) phones.add(ph);
    if (r.googlePlaceId) placeIds.add(String(r.googlePlaceId));
  }

  return { domains, emails, phones, placeIds };
}

export async function isDuplicateLead(
  fp: LeadFingerprints,
  match: {
    host?: string | null;
    email?: string | null;
    phone?: string | null;
    placeId?: string | null;
  }
): Promise<boolean> {
  if (match.placeId && fp.placeIds.has(match.placeId)) return true;
  const host = match.host ? normalizeWebsite(match.host) : null;
  if (host && fp.domains.has(host)) return true;
  const em = normalizeEmail(match.email);
  if (em && fp.emails.has(em)) return true;
  const ph = normalizePhone(match.phone);
  if (ph && fp.phones.has(ph)) return true;

  const or: Record<string, unknown>[] = [];
  if (host) or.push({ websiteNormalized: host });
  if (match.placeId) or.push({ googlePlaceId: match.placeId });
  if (em) or.push({ email: em });
  if (ph) or.push({ phone: { contains: ph.slice(-10) } });

  if (!or.length) return false;
  const existing = await (prisma as any).saLeadCompany.findFirst({ where: { OR: or } });
  if (existing) {
    if (host) fp.domains.add(host);
    if (em) fp.emails.add(em);
    if (ph) fp.phones.add(ph);
    if (match.placeId) fp.placeIds.add(match.placeId);
    return true;
  }
  return false;
}

export function registerNewLead(fp: LeadFingerprints, lead: {
  websiteNormalized?: string | null;
  email?: string | null;
  phone?: string | null;
  googlePlaceId?: string | null;
}) {
  if (lead.websiteNormalized) fp.domains.add(String(lead.websiteNormalized).toLowerCase());
  const em = normalizeEmail(lead.email);
  if (em) fp.emails.add(em);
  const ph = normalizePhone(lead.phone);
  if (ph) fp.phones.add(ph);
  if (lead.googlePlaceId) fp.placeIds.add(String(lead.googlePlaceId));
}
