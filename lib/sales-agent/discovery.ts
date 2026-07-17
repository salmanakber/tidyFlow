import prisma from '@/lib/prisma';
import { getDiscoveryConfig } from './config';
import { saLog } from './logger';
import { recordDiscoveryChunkResult } from './groups';

export function normalizeWebsite(url?: string | null): string | null {
  if (!url) return null;
  try {
    let u = url.trim().toLowerCase();
    if (!u.startsWith('http')) u = `https://${u}`;
    const parsed = new URL(u);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || null;
  }
}

export interface DiscoveredPlace {
  name: string;
  website?: string | null;
  address?: string | null;
  phone?: string | null;
  googlePlaceId?: string | null;
  googleRating?: number | null;
  reviewCount?: number | null;
  businessStatus?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  category?: string | null;
  source: 'GOOGLE_PLACES' | 'SEARCH_ENGINE' | 'MANUAL' | 'IMPORT';
  discoveryKeyword?: string;
}

export interface PlacesSearchInput {
  keyword: string;
  country?: string;
  state?: string;
  city?: string;
  radiusMeters?: number;
  category?: string;
  campaignId?: number;
  userId?: number;
  maxResults?: number;
  discoveryGroupId?: number;
}

function buildQuery(input: PlacesSearchInput) {
  const parts = [input.keyword || input.category || 'cleaning company'];
  if (input.city) parts.push(input.city);
  if (input.state) parts.push(input.state);
  if (input.country) parts.push(input.country);
  return parts.filter(Boolean).join(' ');
}

/** Google Places Text Search (New) API */
export async function discoverViaGooglePlaces(input: PlacesSearchInput): Promise<{
  created: number;
  skipped: number;
  leads: any[];
}> {
  const config = await getDiscoveryConfig();
  if (!config.googlePlacesApiKey) {
    throw new Error('Google Places API key not configured. Set it in AI Sales Agent Settings.');
  }

  const query = buildQuery(input);
  const started = Date.now();

  await saLog({
    category: 'google_places',
    action: 'search_start',
    message: `Searching Places: ${query}`,
    details: input,
    userId: input.userId,
  });

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.googlePlacesApiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.addressComponents',
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: Math.min(input.maxResults || config.maxResults, 20),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    await saLog({
      level: 'error',
      category: 'google_places',
      action: 'search_failed',
      message: body,
      success: false,
      durationMs: Date.now() - started,
      userId: input.userId,
    });
    throw new Error(`Google Places API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  const places = data.places || [];
  let created = 0;
  let skipped = 0;
  const leads: any[] = [];

  for (const place of places) {
    const name = place.displayName?.text || 'Unknown';
    const website = place.websiteUri || null;
    const websiteNormalized = normalizeWebsite(website);
    const phone = place.nationalPhoneNumber || null;
    const googlePlaceId = place.id || null;

    let city = input.city || null;
    let state = input.state || null;
    let country = input.country || null;
    for (const c of place.addressComponents || []) {
      const types: string[] = c.types || [];
      if (types.includes('locality')) city = c.longText || city;
      if (types.includes('administrative_area_level_1')) state = c.longText || state;
      if (types.includes('country')) country = c.longText || country;
    }

    const existing = await (prisma as any).saLeadCompany.findFirst({
      where: {
        OR: [
          googlePlaceId ? { googlePlaceId } : undefined,
          websiteNormalized ? { websiteNormalized } : undefined,
        ].filter(Boolean),
      },
    });

    if (existing) {
      skipped++;
      // Skip companies already in the system — do not attach them to this search
      continue;
    }

    const lead = await (prisma as any).saLeadCompany.create({
      data: {
        name,
        website,
        websiteNormalized,
        address: place.formattedAddress || null,
        phone,
        city,
        state,
        country,
        googlePlaceId,
        googleRating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? null,
        businessStatus: place.businessStatus || null,
        category: input.category || 'cleaning',
        industry: 'cleaning',
        source: 'GOOGLE_PLACES',
        discoveryKeyword: query,
        campaignId: input.campaignId || null,
        hasWebsite: !!website,
        hasPhone: !!phone,
        hasEmail: false,
        status: 'NEW',
      },
    });
    created++;
    leads.push(lead);
  }

  if (input.campaignId) {
    await (prisma as any).saCampaign.update({
      where: { id: input.campaignId },
      data: { leadsDiscovered: { increment: created } },
    });
  }

  await saLog({
    category: 'google_places',
    action: 'search_complete',
    message: `Found ${places.length}, created ${created}, skipped ${skipped}`,
    details: { query, created, skipped, discoveryGroupId: input.discoveryGroupId },
    durationMs: Date.now() - started,
    userId: input.userId,
  });

  await recordDiscoveryChunkResult(input.discoveryGroupId, { created, skipped, leads });

  return { created, skipped, leads };
}

/** Fallback: search-engine style discovery via DuckDuckGo HTML (no API key). */
export async function discoverViaSearchEngine(input: {
  keyword: string;
  country?: string;
  city?: string;
  state?: string;
  maxResults?: number;
  campaignId?: number;
  userId?: number;
  discoveryGroupId?: number;
}): Promise<{ created: number; skipped: number; leads: any[] }> {
  const config = await getDiscoveryConfig();
  const maxResults = input.maxResults || config.maxResults;
  const locationParts = [input.city, input.state, input.country].filter(Boolean);
  const fullKeyword = locationParts.length
    ? `${input.keyword} ${locationParts.join(' ')}`
    : input.keyword;
  const query = encodeURIComponent(fullKeyword);
  const started = Date.now();

  await saLog({
    category: 'search',
    action: 'search_start',
    message: `Search engine discovery: ${fullKeyword}`,
    details: { country: input.country, city: input.city },
    userId: input.userId,
  });

  const response = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TidyFlowSalesAgent/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Search engine request failed (${response.status})`);
  }

  const html = await response.text();
  const hrefRegex = /uddg=([^&"]+)/g;
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) && urls.length < maxResults) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.startsWith('http') && !decoded.includes('duckduckgo.com')) {
        urls.push(decoded);
      }
    } catch {
      /* skip */
    }
  }

  const resultRegex = /class="result__a"[^>]*href="([^"]+)"/g;
  while ((match = resultRegex.exec(html)) && urls.length < maxResults) {
    const href = match[1];
    if (href.startsWith('http') && !href.includes('duckduckgo.com')) {
      urls.push(href);
    }
  }

  const uniqueHosts = new Map<string, string>();
  for (const url of urls) {
    const host = normalizeWebsite(url);
    if (host && !uniqueHosts.has(host)) uniqueHosts.set(host, url.split('?')[0]);
  }

  let created = 0;
  let skipped = 0;
  const leads: any[] = [];

  for (const [host, url] of uniqueHosts) {
    const existing = await (prisma as any).saLeadCompany.findFirst({
      where: { websiteNormalized: host },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const lead = await (prisma as any).saLeadCompany.create({
      data: {
        name: host,
        website: url,
        websiteNormalized: host,
        city: input.city || null,
        state: input.state || null,
        country: input.country || null,
        source: 'SEARCH_ENGINE',
        discoveryKeyword: fullKeyword,
        campaignId: input.campaignId || null,
        hasWebsite: true,
        hasEmail: false,
        hasPhone: false,
        industry: 'cleaning',
        status: 'NEW',
      },
    });
    created++;
    leads.push(lead);

    if (config.searchDelayMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(config.searchDelayMs, 500)));
    }
  }

  if (input.campaignId) {
    await (prisma as any).saCampaign.update({
      where: { id: input.campaignId },
      data: { leadsDiscovered: { increment: created } },
    });
  }

  await saLog({
    category: 'search',
    action: 'search_complete',
    message: `Search created ${created}, skipped ${skipped} (${fullKeyword})`,
    durationMs: Date.now() - started,
    userId: input.userId,
  });

  await recordDiscoveryChunkResult(input.discoveryGroupId, { created, skipped, leads });

  return { created, skipped, leads };
}

/**
 * Run discovery across multiple countries / cities / keywords.
 * Used for multi-country outreach and AI-assisted lead finding.
 */
export async function discoverMultiLocation(input: {
  method?: 'google_places' | 'search_engine';
  keywords: string[];
  countries?: string[];
  cities?: string[];
  maxResults?: number;
  campaignId?: number;
  userId?: number;
  discoveryGroupId?: number;
}): Promise<{ created: number; skipped: number; runs: number; details: any[]; discoveryGroupId?: number }> {
  const method = input.method || 'google_places';
  const keywords = (input.keywords || []).map((k) => k.trim()).filter(Boolean);
  const countries = (input.countries || []).map((c) => c.trim()).filter(Boolean);
  const cities = (input.cities || []).map((c) => c.trim()).filter(Boolean);

  if (!keywords.length) throw new Error('At least one keyword is required');

  const countryList = countries.length ? countries : [undefined];
  const cityList = cities.length ? cities : [undefined];

  let groupId = input.discoveryGroupId;
  if (!groupId) {
    const { createDiscoveryGroup } = await import('./groups');
    const totalChunks = keywords.length * countryList.length * cityList.length;
    const group = await createDiscoveryGroup({
      method,
      countries,
      cities,
      keywords,
      totalChunks,
      userId: input.userId,
      status: 'RUNNING',
    });
    groupId = group.id;
  }

  let created = 0;
  let skipped = 0;
  let runs = 0;
  const details: any[] = [];

  for (const keyword of keywords) {
    for (const country of countryList) {
      for (const city of cityList) {
        runs++;
        try {
          const result =
            method === 'search_engine'
              ? await discoverViaSearchEngine({
                  keyword,
                  country,
                  city,
                  maxResults: input.maxResults,
                  campaignId: input.campaignId,
                  userId: input.userId,
                  discoveryGroupId: groupId,
                })
              : await discoverViaGooglePlaces({
                  keyword,
                  country,
                  city,
                  maxResults: input.maxResults,
                  campaignId: input.campaignId,
                  userId: input.userId,
                  discoveryGroupId: groupId,
                });
          created += result.created;
          skipped += result.skipped;
          details.push({ keyword, country, city, ...result, leads: undefined });
        } catch (err: any) {
          details.push({ keyword, country, city, error: err.message });
          // Still count the chunk so group can complete
          await recordDiscoveryChunkResult(groupId, { created: 0, skipped: 0, leads: [] });
          await saLog({
            level: 'warn',
            category: method === 'search_engine' ? 'search' : 'google_places',
            action: 'multi_discovery_part_failed',
            message: err.message,
            details: { keyword, country, city },
            success: false,
            userId: input.userId,
          });
        }
      }
    }
  }

  return { created, skipped, runs, details, discoveryGroupId: groupId };
}
