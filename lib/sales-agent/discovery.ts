import prisma from '@/lib/prisma';
import { getDiscoveryConfig } from './config';
import { saLog } from './logger';
import { recordDiscoveryChunkResult } from './groups';
import {
  buildSearchQueries,
  isDirectoryHost,
  isDuplicateLead,
  isGoogleMapsUrl,
  loadLeadFingerprints,
  looksLikeCleaningBusiness,
  parseGoogleMapsPlace,
  registerNewLead,
} from './discovery-filters';

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

/** True only for a real business site on the Google Business profile (not Maps / Google host URLs). */
export function gbpHasWebsite(websiteUri?: string | null): boolean {
  const raw = String(websiteUri || '').trim();
  if (!raw) return false;
  try {
    const withProto = raw.startsWith('http') ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.replace(/^www\./, '').toLowerCase();
    if (!host) return false;
    // These appear on some listings but are not a business website field
    if (
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      host === 'goo.gl' ||
      host.endsWith('.goo.gl') ||
      host === 'maps.app.goo.gl' ||
      host.includes('googleusercontent') ||
      host === 'share.google' ||
      host.endsWith('.share.google')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizePlaceId(id?: string | null): string | null {
  if (!id) return null;
  const s = String(id).trim();
  if (!s) return null;
  return s.startsWith('places/') ? s : `places/${s}`;
}

function addressComponentMatch(
  place: any,
  input: { country?: string; city?: string; state?: string }
): boolean {
  const comps: any[] = place.addressComponents || [];
  const get = (type: string) => {
    const c = comps.find((x) => (x.types || []).includes(type));
    return String(c?.longText || c?.shortText || '').toLowerCase();
  };
  if (input.country) {
    const want = input.country.trim().toLowerCase();
    const got = get('country');
    if (got && !got.includes(want) && !want.includes(got)) return false;
  }
  if (input.city) {
    const want = input.city.trim().toLowerCase();
    const locality = get('locality') || get('postal_town') || get('sublocality');
    const formatted = String(place.formattedAddress || '').toLowerCase();
    if (locality) {
      if (!locality.includes(want) && !want.includes(locality)) return false;
    } else if (formatted && !formatted.includes(want)) {
      return false;
    }
  }
  if (input.state) {
    const want = input.state.trim().toLowerCase();
    const admin = get('administrative_area_level_1');
    if (admin && !admin.includes(want) && !want.includes(admin)) return false;
  }
  return true;
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
  /** Extra Google Business filters (Places API + post-filter) */
  filters?: PlacesDiscoveryFilters;
}

/**
 * Google does not expose company registration date for most listings.
 * We approximate "new vs established" with review volume + future-opening flag.
 * @see https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export interface PlacesDiscoveryFilters {
  /** any | likely_new (few reviews) | established (many reviews) | opening_soon */
  maturity?: 'any' | 'likely_new' | 'established' | 'opening_soon';
  maxReviewCount?: number;
  minReviewCount?: number;
  minRating?: number;
  /** any | with_website | without_website — exact GBP websiteUri (not Maps links) */
  website?: 'any' | 'with_website' | 'without_website';
  /** Include mobile / service-area businesses (common for cleaning) */
  includePureServiceArea?: boolean;
  openNow?: boolean;
}

function resolveMaturityBounds(filters?: PlacesDiscoveryFilters): {
  minReviewCount?: number;
  maxReviewCount?: number;
  openingSoonOnly?: boolean;
  includeFutureOpening?: boolean;
} {
  if (!filters) return {};
  const maturity = filters.maturity || 'any';
  if (maturity === 'likely_new') {
    return {
      maxReviewCount: filters.maxReviewCount ?? 15,
      minReviewCount: filters.minReviewCount,
      includeFutureOpening: false,
    };
  }
  if (maturity === 'established') {
    return {
      minReviewCount: filters.minReviewCount ?? 50,
      maxReviewCount: filters.maxReviewCount,
      includeFutureOpening: false,
    };
  }
  if (maturity === 'opening_soon') {
    return {
      openingSoonOnly: true,
      includeFutureOpening: true,
    };
  }
  return {
    minReviewCount: filters.minReviewCount,
    maxReviewCount: filters.maxReviewCount,
    includeFutureOpening: false,
  };
}

function placePassesFilters(
  place: any,
  filters?: PlacesDiscoveryFilters,
  location?: { country?: string; city?: string; state?: string }
): boolean {
  if (!filters && !location) return true;
  const bounds = resolveMaturityBounds(filters);
  // Exact GBP fields only — never invent values
  const reviews =
    place.userRatingCount != null && place.userRatingCount !== undefined
      ? Number(place.userRatingCount)
      : null;
  const rating =
    place.rating != null && place.rating !== undefined ? Number(place.rating) : null;
  const hasWebsite = gbpHasWebsite(place.websiteUri);
  const status = String(place.businessStatus || '');

  if (location && !addressComponentMatch(place, location)) return false;

  if (bounds.openingSoonOnly) {
    if (status !== 'FUTURE_OPENING') return false;
  } else if (status === 'CLOSED_PERMANENTLY') {
    return false;
  }

  if (bounds.maxReviewCount != null) {
    if (reviews == null || reviews > bounds.maxReviewCount) return false;
  }
  if (bounds.minReviewCount != null) {
    if (reviews == null || reviews < bounds.minReviewCount) return false;
  }
  if (filters?.minRating != null) {
    if (rating == null || rating < filters.minRating) return false;
  }

  if (filters?.website === 'with_website' && !hasWebsite) return false;
  if (filters?.website === 'without_website' && hasWebsite) return false;

  return true;
}

async function fetchPlaceDetailsExact(
  apiKey: string,
  placeId: string
): Promise<any | null> {
  const resource = normalizePlaceId(placeId);
  if (!resource) return null;
  try {
    const response = await fetch(`https://places.googleapis.com/v1/${resource}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'id,displayName,formattedAddress,websiteUri,nationalPhoneNumber,rating,userRatingCount,businessStatus,addressComponents,openingDate,types,googleMapsUri',
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function filtersNeedExactVerify(filters?: PlacesDiscoveryFilters): boolean {
  if (!filters) return false;
  if (filters.website && filters.website !== 'any') return true;
  if (filters.maturity && filters.maturity !== 'any') return true;
  if (filters.minRating != null && filters.minRating > 0) return true;
  if (filters.minReviewCount != null || filters.maxReviewCount != null) return true;
  return false;
}

function buildQuery(input: PlacesSearchInput) {
  const parts = [input.keyword || input.category || 'cleaning company'];
  if (input.city) parts.push(input.city);
  if (input.state) parts.push(input.state);
  if (input.country) parts.push(input.country);
  return parts.filter(Boolean).join(' ');
}

/** Google Places Text Search (New) — scrapes Google Business listings */
export async function discoverViaGooglePlaces(input: PlacesSearchInput): Promise<{
  created: number;
  skipped: number;
  leads: any[];
  filteredOut?: number;
}> {
  const config = await getDiscoveryConfig();
  if (!config.googlePlacesApiKey) {
    throw new Error('Google Places API key not configured. Set it in AI Sales Agent Settings.');
  }

  const query = buildQuery(input);
  const started = Date.now();
  const filters = input.filters || {};
  const bounds = resolveMaturityBounds(filters);
  const location = { country: input.country, city: input.city, state: input.state };
  const exactVerify = filtersNeedExactVerify(filters);
  const fingerprints = await loadLeadFingerprints({ country: input.country });

  await saLog({
    category: 'google_places',
    action: 'search_start',
    message: `Searching Google Business (Places): ${query}`,
    details: { ...input, filters, exactVerify },
    userId: input.userId,
  });

  const requestBody: Record<string, unknown> = {
    textQuery: query,
    // Fetch full page then post-filter on exact GBP fields
    maxResultCount: Math.min(Math.max(input.maxResults || config.maxResults, 20), 20),
  };

  if (filters.minRating != null && filters.minRating > 0) {
    requestBody.minRating = Math.min(5, Math.max(0, Number(filters.minRating)));
  }
  if (filters.openNow) {
    requestBody.openNow = true;
  }
  if (filters.includePureServiceArea !== false) {
    requestBody.includePureServiceAreaBusinesses = true;
  }
  if (bounds.includeFutureOpening) {
    requestBody.includeFutureOpeningBusinesses = true;
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.googlePlacesApiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.addressComponents,places.openingDate,places.types,places.googleMapsUri',
    },
    body: JSON.stringify(requestBody),
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
  let filteredOut = 0;
  const leads: any[] = [];
  const targetCount = Math.min(input.maxResults || config.maxResults, 20);

  for (const rawPlace of places) {
    if (created >= targetCount) break;

    // When filters are on, re-read Place Details so website/rating/reviews match the live GBP
    let place = rawPlace;
    if (exactVerify && rawPlace.id) {
      const details = await fetchPlaceDetailsExact(config.googlePlacesApiKey, rawPlace.id);
      if (details) place = { ...rawPlace, ...details };
    }

    if (!placePassesFilters(place, filters, location)) {
      filteredOut++;
      continue;
    }

    const name = place.displayName?.text || 'Unknown';
    const hasSite = gbpHasWebsite(place.websiteUri);
    const website = hasSite ? String(place.websiteUri).trim() : null;
    const websiteNormalized = normalizeWebsite(website);
    const phone = place.nationalPhoneNumber || null;
    const googlePlaceId = place.id || rawPlace.id || null;

    let city = input.city || null;
    let state = input.state || null;
    let country = input.country || null;
    for (const c of place.addressComponents || []) {
      const types: string[] = c.types || [];
      if (types.includes('locality')) city = c.longText || city;
      if (types.includes('administrative_area_level_1')) state = c.longText || state;
      if (types.includes('country')) country = c.longText || country;
    }

    const dup = await isDuplicateLead(fingerprints, {
      host: websiteNormalized,
      phone,
      placeId: googlePlaceId,
    });
    if (dup) {
      skipped++;
      continue;
    }

    const openingHint = place.openingDate
      ? ` opening=${place.openingDate.year || ''}-${place.openingDate.month || ''}-${place.openingDate.day || ''}`
      : '';

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
        discoveryKeyword: `${query}${openingHint}${filters.maturity ? ` [${filters.maturity}]` : ''}${filters.website && filters.website !== 'any' ? ` [${filters.website}]` : ''}`,
        campaignId: input.campaignId || null,
        hasWebsite: hasSite,
        hasPhone: !!phone,
        hasEmail: false,
        status: 'NEW',
      },
    });
    registerNewLead(fingerprints, {
      websiteNormalized,
      phone,
      googlePlaceId,
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
    message: `Found ${places.length}, created ${created}, skipped ${skipped}, filtered ${filteredOut}`,
    details: { query, created, skipped, filteredOut, filters, exactVerify, discoveryGroupId: input.discoveryGroupId },
    durationMs: Date.now() - started,
    userId: input.userId,
  });

  await recordDiscoveryChunkResult(input.discoveryGroupId, { created, skipped, leads });

  return { created, skipped, leads, filteredOut };
}

function extractDuckDuckGoUrls(html: string, maxResults: number): string[] {
  const urls: string[] = [];
  const hrefRegex = /uddg=([^&"]+)/g;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) && urls.length < maxResults * 3) {
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
  while ((match = resultRegex.exec(html)) && urls.length < maxResults * 3) {
    const href = match[1];
    if (href.startsWith('http') && !href.includes('duckduckgo.com')) {
      urls.push(href);
    }
  }

  const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = snippetRegex.exec(html)) && urls.length < maxResults * 3) {
    const snippet = match[1].replace(/<[^>]+>/g, ' ');
    const httpInSnippet = snippet.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    urls.push(...httpInSnippet);
  }

  return urls;
}

/** Search-engine discovery via DuckDuckGo HTML (no API key). */
export async function discoverViaSearchEngine(input: {
  keyword: string;
  country?: string;
  city?: string;
  state?: string;
  maxResults?: number;
  campaignId?: number;
  userId?: number;
  discoveryGroupId?: number;
  /** When true (e.g. paired with Google Business), only Maps / business-profile URLs. */
  profileOnly?: boolean;
  chunkIndex?: number;
}): Promise<{ created: number; skipped: number; leads: any[]; filteredOut?: number }> {
  const config = await getDiscoveryConfig();
  const maxResults = input.maxResults || config.maxResults;
  const profileOnly = !!input.profileOnly;
  const locationParts = [input.city, input.state, input.country].filter(Boolean);
  const fullKeyword = locationParts.length
    ? `${input.keyword} ${locationParts.join(' ')}`
    : input.keyword;
  const searchQuery = buildSearchQueries({
    keyword: input.keyword,
    city: input.city,
    state: input.state,
    country: input.country,
    profileOnly,
    chunkIndex: input.chunkIndex,
  })[0];
  const query = encodeURIComponent(searchQuery);
  const started = Date.now();
  const fingerprints = await loadLeadFingerprints({ country: input.country });

  await saLog({
    category: 'search',
    action: 'search_start',
    message: `Search engine discovery (${profileOnly ? 'business profiles' : 'websites'}): ${searchQuery}`,
    details: { country: input.country, city: input.city, profileOnly },
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
  const rawUrls = extractDuckDuckGoUrls(html, maxResults);

  type Candidate = {
    url: string;
    host: string | null;
    name?: string;
    placeId?: string;
    isMaps: boolean;
    snippet?: string;
  };

  const candidates: Candidate[] = [];
  const seenKeys = new Set<string>();

  for (const url of rawUrls) {
    if (isGoogleMapsUrl(url)) {
      if (!profileOnly) continue;
      const parsed = parseGoogleMapsPlace(url);
      const key = parsed.placeId || parsed.mapsUrl;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      candidates.push({
        url: parsed.mapsUrl,
        host: parsed.placeId ? `maps-${parsed.placeId}` : normalizeWebsite(parsed.mapsUrl),
        name: parsed.name,
        placeId: parsed.placeId,
        isMaps: true,
      });
      continue;
    }

    if (profileOnly) continue;

    const host = normalizeWebsite(url);
    if (!host || isDirectoryHost(host)) continue;
    if (seenKeys.has(host)) continue;

    // Snippet/title context from surrounding HTML (lightweight signal)
    const idx = html.indexOf(url.slice(0, 40));
    const snippet =
      idx >= 0 ? html.slice(Math.max(0, idx - 200), idx + 200).replace(/<[^>]+>/g, ' ') : '';
    if (!looksLikeCleaningBusiness(snippet, input.keyword)) continue;

    seenKeys.add(host);
    candidates.push({ url: url.split('?')[0], host, isMaps: false, snippet });
  }

  let created = 0;
  let skipped = 0;
  let filteredOut = 0;
  const leads: any[] = [];

  for (const cand of candidates) {
    if (leads.length >= maxResults) break;

    const dup = await isDuplicateLead(fingerprints, {
      host: cand.host,
      placeId: cand.placeId,
    });
    if (dup) {
      skipped++;
      continue;
    }

    if (!cand.isMaps && cand.host && isDirectoryHost(cand.host)) {
      filteredOut++;
      continue;
    }

    const name = cand.name || cand.host || 'Unknown';
    const website = cand.isMaps ? null : cand.url;
    const websiteNormalized = cand.isMaps
      ? cand.placeId
        ? `place-${cand.placeId}`
        : normalizeWebsite(cand.url)
      : cand.host;

    const lead = await (prisma as any).saLeadCompany.create({
      data: {
        name,
        website,
        websiteNormalized,
        city: input.city || null,
        state: input.state || null,
        country: input.country || null,
        googlePlaceId: cand.placeId || null,
        source: profileOnly ? 'GOOGLE_MAPS_SEARCH' : 'SEARCH_ENGINE',
        discoveryKeyword: `${fullKeyword}${profileOnly ? ' [profiles]' : ''}`,
        campaignId: input.campaignId || null,
        hasWebsite: !!website,
        hasEmail: false,
        hasPhone: false,
        industry: 'cleaning',
        status: 'NEW',
      },
    });
    registerNewLead(fingerprints, {
      websiteNormalized,
      googlePlaceId: cand.placeId,
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
    message: `Search created ${created}, skipped ${skipped}, filtered ${filteredOut} (${searchQuery})`,
    durationMs: Date.now() - started,
    userId: input.userId,
    details: { profileOnly, filteredOut },
  });

  await recordDiscoveryChunkResult(input.discoveryGroupId, { created, skipped, leads });

  return { created, skipped, leads, filteredOut };
}

/**
 * Run discovery across multiple countries / cities / keywords.
 * Used for multi-country outreach and AI-assisted lead finding.
 */
export async function discoverMultiLocation(input: {
  method?: 'google_places' | 'search_engine';
  /** Run both Google Business and search-engine chunks when set. */
  methods?: Array<'google_places' | 'search_engine'>;
  keywords: string[];
  countries?: string[];
  cities?: string[];
  maxResults?: number;
  campaignId?: number;
  userId?: number;
  discoveryGroupId?: number;
  filters?: PlacesDiscoveryFilters;
  /** Search engine targets Maps/business profiles (auto when paired with Google Business). */
  profileOnly?: boolean;
}): Promise<{ created: number; skipped: number; runs: number; details: any[]; discoveryGroupId?: number }> {
  const methods =
    input.methods?.length
      ? input.methods
      : [input.method || 'google_places'];
  const profileOnly =
    input.profileOnly ?? (methods.includes('google_places') && methods.includes('search_engine'));
  const keywords = (input.keywords || []).map((k) => k.trim()).filter(Boolean);
  const countries = (input.countries || []).map((c) => c.trim()).filter(Boolean);
  const cities = (input.cities || []).map((c) => c.trim()).filter(Boolean);

  if (!keywords.length) throw new Error('At least one keyword is required');

  const countryList = countries.length ? countries : [undefined];
  const cityList = cities.length ? cities : [undefined];

  let groupId = input.discoveryGroupId;
  const chunksPerCombo = methods.length;
  const totalChunks = keywords.length * countryList.length * cityList.length * chunksPerCombo;
  if (!groupId) {
    const { createDiscoveryGroup } = await import('./groups');
    const groupMethod =
      methods.length > 1 ? 'MIXED' : methods[0] === 'search_engine' ? 'search_engine' : 'google_places';
    const group = await createDiscoveryGroup({
      method: groupMethod,
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
  let chunkIndex = 0;

  for (const keyword of keywords) {
    for (const country of countryList) {
      for (const city of cityList) {
        for (const method of methods) {
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
                    profileOnly,
                    chunkIndex,
                  })
                : await discoverViaGooglePlaces({
                    keyword,
                    country,
                    city,
                    maxResults: input.maxResults,
                    campaignId: input.campaignId,
                    userId: input.userId,
                    discoveryGroupId: groupId,
                    filters: input.filters,
                  });
            chunkIndex++;
            created += result.created;
            skipped += result.skipped;
            details.push({ keyword, country, city, method, profileOnly, ...result, leads: undefined });
          } catch (err: any) {
            chunkIndex++;
            details.push({ keyword, country, city, method, error: err.message });
            await recordDiscoveryChunkResult(groupId, { created: 0, skipped: 0, leads: [] });
            await saLog({
              level: 'warn',
              category: method === 'search_engine' ? 'search' : 'google_places',
              action: 'multi_discovery_part_failed',
              message: err.message,
              details: { keyword, country, city, method },
              success: false,
              userId: input.userId,
            });
          }
        }
      }
    }
  }

  return { created, skipped, runs, details, discoveryGroupId: groupId };
}
