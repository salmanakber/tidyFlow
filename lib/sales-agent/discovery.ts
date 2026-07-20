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

/** Map legacy Places API (Text Search / Details) into Places API (New) shape. */
function mapLegacyPlaceToNew(legacy: any): any {
  const comps = (legacy.address_components || []).map((c: any) => ({
    longText: c.long_name,
    shortText: c.short_name,
    types: c.types || [],
  }));
  const statusMap: Record<string, string> = {
    OPERATIONAL: 'OPERATIONAL',
    CLOSED_TEMPORARILY: 'CLOSED_TEMPORARILY',
    CLOSED_PERMANENTLY: 'CLOSED_PERMANENTLY',
  };
  return {
    id: legacy.place_id ? `places/${legacy.place_id}` : null,
    displayName: { text: legacy.name || 'Unknown' },
    formattedAddress: legacy.formatted_address || null,
    websiteUri: legacy.website || null,
    nationalPhoneNumber: legacy.formatted_phone_number || legacy.international_phone_number || null,
    rating: legacy.rating ?? null,
    userRatingCount: legacy.user_ratings_total ?? null,
    businessStatus: statusMap[legacy.business_status] || legacy.business_status || 'OPERATIONAL',
    addressComponents: comps,
    types: legacy.types || [],
    googleMapsUri: legacy.url || null,
    _legacyPlaceId: legacy.place_id || null,
  };
}

async function fetchLegacyPlaceDetails(apiKey: string, placeId: string): Promise<any | null> {
  const id = String(placeId || '').replace(/^places\//, '');
  if (!id) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', id);
    url.searchParams.set(
      'fields',
      'place_id,name,formatted_address,website,formatted_phone_number,international_phone_number,rating,user_ratings_total,business_status,address_component,type,url'
    );
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.result) return null;
    return mapLegacyPlaceToNew(data.result);
  } catch {
    return null;
  }
}

/**
 * Legacy Places Text Search — works when "Places API" is enabled but
 * Places API (New) SearchText is blocked (403 API_KEY_SERVICE_BLOCKED).
 */
async function searchPlacesLegacy(
  apiKey: string,
  query: string,
  maxResults: number
): Promise<{ places: any[]; error?: string }> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status === 'REQUEST_DENIED') {
      return {
        places: [],
        error:
          data.error_message ||
          'Legacy Places Text Search denied — enable Places API (or Places API New) for this key in Google Cloud Console.',
      };
    }
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return {
        places: [],
        error: `Legacy Places status ${data.status}: ${data.error_message || 'unknown'}`,
      };
    }
    const results = Array.isArray(data.results) ? data.results.slice(0, maxResults) : [];
    // Enrich with Details so website/phone are available (Text Search omits website)
    const places: any[] = [];
    for (const row of results) {
      const details = await fetchLegacyPlaceDetails(apiKey, row.place_id);
      places.push(details || mapLegacyPlaceToNew(row));
    }
    return { places };
  } catch (err: any) {
    return { places: [], error: err?.message || 'Legacy Places request failed' };
  }
}

function isPlacesNewApiBlocked(status: number, body: string): boolean {
  if (status === 403) return true;
  const t = body.toLowerCase();
  return (
    t.includes('api_key_service_blocked') ||
    t.includes('permission_denied') ||
    t.includes('are blocked') ||
    t.includes('places.googleapis.com')
  );
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

  let places: any[] = [];
  let usedApi: 'places_new' | 'places_legacy' = 'places_new';

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

  if (response.ok) {
    const data = await response.json();
    places = data.places || [];
  } else {
    const body = await response.text();
    await saLog({
      level: 'warn',
      category: 'google_places',
      action: 'search_new_api_failed',
      message: body.slice(0, 800),
      success: false,
      userId: input.userId,
      details: { status: response.status },
    });

    if (isPlacesNewApiBlocked(response.status, body)) {
      // Key often has classic "Places API" enabled but not Places API (New)
      const legacy = await searchPlacesLegacy(
        config.googlePlacesApiKey,
        query,
        Math.min(Math.max(input.maxResults || config.maxResults, 20), 20)
      );
      if (legacy.error && !legacy.places.length) {
        throw new Error(
          `Google Places blocked for Places API (New). Legacy fallback also failed: ${legacy.error}. ` +
            `In Google Cloud Console → APIs & Services → enable “Places API” and/or “Places API (New)”, ` +
            `and remove Places restrictions from this API key (project 28387859014).`
        );
      }
      places = legacy.places;
      usedApi = 'places_legacy';
      await saLog({
        category: 'google_places',
        action: 'search_legacy_fallback',
        message: `Used legacy Places Text Search (${places.length} results) after New API ${response.status}`,
        userId: input.userId,
      });
    } else {
      throw new Error(`Google Places API error (${response.status}): ${body}`);
    }
  }

  let created = 0;
  let skipped = 0;
  let filteredOut = 0;
  const leads: any[] = [];
  const targetCount = Math.min(input.maxResults || config.maxResults, 20);

  for (const rawPlace of places) {
    if (created >= targetCount) break;

    // When filters are on, re-read Place Details so website/rating/reviews match the live GBP
    let place = rawPlace;
    if (exactVerify && (rawPlace.id || rawPlace._legacyPlaceId)) {
      const details =
        usedApi === 'places_legacy'
          ? await fetchLegacyPlaceDetails(
              config.googlePlacesApiKey,
              rawPlace._legacyPlaceId || rawPlace.id
            )
          : await fetchPlaceDetailsExact(config.googlePlacesApiKey, rawPlace.id);
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
    details: {
      query,
      created,
      skipped,
      filteredOut,
      filters,
      exactVerify,
      usedApi,
      discoveryGroupId: input.discoveryGroupId,
    },
    durationMs: Date.now() - started,
    userId: input.userId,
  });

  await recordDiscoveryChunkResult(input.discoveryGroupId, { created, skipped, leads });

  return { created, skipped, leads, filteredOut };
}

function extractDuckDuckGoUrls(html: string, maxResults: number): Array<{ url: string; title?: string; snippet?: string }> {
  const out: Array<{ url: string; title?: string; snippet?: string }> = [];
  const seen = new Set<string>();

  const push = (raw: string, title?: string, snippet?: string) => {
    try {
      let url = raw;
      if (url.includes('uddg=')) {
        const m = url.match(/uddg=([^&]+)/);
        if (m) url = decodeURIComponent(m[1]);
      }
      if (!url.startsWith('http') || url.includes('duckduckgo.com')) return;
      const key = url.split('?')[0].toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ url, title, snippet });
    } catch {
      /* skip */
    }
  };

  // Result blocks: title link + snippet
  const blockRe =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td)>|)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) && out.length < maxResults * 4) {
    const title = match[2]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const snippet = match[3]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    push(match[1], title, snippet);
  }

  const hrefRegex = /uddg=([^&"]+)/g;
  while ((match = hrefRegex.exec(html)) && out.length < maxResults * 4) {
    try {
      push(decodeURIComponent(match[1]));
    } catch {
      /* skip */
    }
  }

  return out;
}

async function fetchSearchHtml(query: string): Promise<string> {
  const encoded = encodeURIComponent(query);
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Try DuckDuckGo HTML first, then lite
  for (const url of [
    `https://html.duckduckgo.com/html/?q=${encoded}`,
    `https://lite.duckduckgo.com/lite/?q=${encoded}`,
  ]) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) continue;
      const html = await response.text();
      if (html && html.length > 500 && !html.includes('anomaly-modal')) return html;
      if (html && html.length > 500) return html;
    } catch {
      /* try next */
    }
  }
  throw new Error('Search engine request failed — DuckDuckGo returned no usable results');
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
  /** Prefer Maps / business-profile URLs; falls back to websites if none found. */
  profileOnly?: boolean;
  chunkIndex?: number;
}): Promise<{ created: number; skipped: number; leads: any[]; filteredOut?: number }> {
  const config = await getDiscoveryConfig();
  const maxResults = input.maxResults || config.maxResults;
  const wantProfiles = !!input.profileOnly;
  const locationParts = [input.city, input.state, input.country].filter(Boolean);
  const fullKeyword = locationParts.length
    ? `${input.keyword} ${locationParts.join(' ')}`
    : input.keyword;
  const searchQuery = buildSearchQueries({
    keyword: input.keyword,
    city: input.city,
    state: input.state,
    country: input.country,
    profileOnly: wantProfiles,
    chunkIndex: input.chunkIndex,
  })[0];
  const started = Date.now();
  const fingerprints = await loadLeadFingerprints({ country: input.country });

  await saLog({
    category: 'search',
    action: 'search_start',
    message: `Search engine discovery (${wantProfiles ? 'profiles-first' : 'websites'}): ${searchQuery}`,
    details: { country: input.country, city: input.city, profileOnly: wantProfiles },
    userId: input.userId,
  });

  let html = await fetchSearchHtml(searchQuery);
  let hits = extractDuckDuckGoUrls(html, maxResults);

  // If profile-oriented query returned nothing useful, retry without Maps restriction
  if (wantProfiles && hits.filter((h) => isGoogleMapsUrl(h.url)).length < 2) {
    const websiteQuery = buildSearchQueries({
      keyword: input.keyword,
      city: input.city,
      state: input.state,
      country: input.country,
      profileOnly: false,
      chunkIndex: input.chunkIndex,
    })[0];
    try {
      html = await fetchSearchHtml(websiteQuery);
      hits = extractDuckDuckGoUrls(html, maxResults);
      await saLog({
        category: 'search',
        action: 'search_profile_fallback_websites',
        message: `Maps query sparse — fell back to website search: ${websiteQuery}`,
        userId: input.userId,
      });
    } catch {
      /* keep original hits */
    }
  }

  type Candidate = {
    url: string;
    host: string | null;
    name?: string;
    placeId?: string;
    isMaps: boolean;
  };

  const candidates: Candidate[] = [];
  const seenKeys = new Set<string>();

  for (const hit of hits) {
    const url = hit.url;
    const context = `${hit.title || ''} ${hit.snippet || ''} ${input.keyword}`;

    if (isGoogleMapsUrl(url)) {
      const parsed = parseGoogleMapsPlace(url);
      const key = parsed.placeId || parsed.mapsUrl;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      candidates.push({
        url: parsed.mapsUrl,
        host: parsed.placeId ? `maps-${parsed.placeId}` : normalizeWebsite(parsed.mapsUrl),
        name: parsed.name || hit.title,
        placeId: parsed.placeId,
        isMaps: true,
      });
      continue;
    }

    const host = normalizeWebsite(url);
    if (!host || isDirectoryHost(host)) continue;
    if (seenKeys.has(host)) continue;

    // Soft filter: keyword already implies cleaning, or title/snippet matches
    if (!looksLikeCleaningBusiness(context, input.keyword) && !looksLikeCleaningBusiness(host, input.keyword)) {
      // Still allow if host looks like a company site (not a generic platform)
      if (!/\.(com|co\.uk|net|org|io|biz|us|ca|au)$/i.test(host)) continue;
      // Reject obvious non-business paths
      if (/wikipedia|amazon|ebay|reddit|youtube/i.test(host)) continue;
    }

    seenKeys.add(host);
    candidates.push({
      url: url.split('?')[0],
      host,
      name: hit.title?.slice(0, 120) || host,
      isMaps: false,
    });
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
        source: cand.isMaps ? 'GOOGLE_MAPS_SEARCH' : 'SEARCH_ENGINE',
        discoveryKeyword: `${fullKeyword}${wantProfiles ? ' [search]' : ''}`,
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
    details: { wantProfiles, filteredOut, candidates: candidates.length, hits: hits.length },
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
  /** Custom label when creating a new group */
  groupLabel?: string;
  filters?: PlacesDiscoveryFilters;
  /** Search prefers Maps profiles first, then falls back to websites */
  profileOnly?: boolean;
}): Promise<{ created: number; skipped: number; runs: number; details: any[]; discoveryGroupId?: number }> {
  const methods =
    input.methods?.length
      ? input.methods
      : [input.method || 'google_places'];
  // Only when explicitly requested — Places already covers GBP; search finds websites by default
  const profileOnly = !!input.profileOnly;
  const keywords = (input.keywords || []).map((k) => k.trim()).filter(Boolean);
  const countries = (input.countries || []).map((c) => c.trim()).filter(Boolean);
  const cities = (input.cities || []).map((c) => c.trim()).filter(Boolean);

  if (!keywords.length) throw new Error('At least one keyword is required');

  const countryList = countries.length ? countries : [undefined];
  const cityList = cities.length ? cities : [undefined];

  let groupId = input.discoveryGroupId ? Number(input.discoveryGroupId) : undefined;
  const chunksPerCombo = methods.length;
  const totalChunks = keywords.length * countryList.length * cityList.length * chunksPerCombo;
  const groupMethod =
    methods.length > 1 ? 'MIXED' : methods[0] === 'search_engine' ? 'search_engine' : 'google_places';

  if (groupId) {
    const existing = await (prisma as any).saDiscoveryGroup.findUnique({ where: { id: groupId } });
    if (!existing) throw new Error(`Discovery group ${groupId} not found`);
    await (prisma as any).saDiscoveryGroup.update({
      where: { id: groupId },
      data: {
        status: 'RUNNING',
        totalChunks: { increment: totalChunks },
      },
    });
  } else {
    const { createDiscoveryGroup } = await import('./groups');
    const group = await createDiscoveryGroup({
      method: groupMethod,
      countries,
      cities,
      keywords,
      totalChunks,
      userId: input.userId,
      status: 'RUNNING',
      label: input.groupLabel?.trim() || undefined,
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
