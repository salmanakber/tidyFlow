import { NextRequest, NextResponse } from 'next/server';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { enqueueMultiDiscovery } from '@/lib/sales-agent/queue';
import { discoverMultiLocation } from '@/lib/sales-agent/discovery';
import { suggestDiscoveryKeywords } from '@/lib/sales-agent/suggest-keywords';
import { saLog } from '@/lib/sales-agent/logger';

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[\n,;|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();

  // AI keyword / city suggestions for multi-country targeting
  if (body.action === 'suggest_keywords') {
    const countries = parseList(body.countries);
    if (!countries.length) return jsonError('countries are required');
    const suggestions = await suggestDiscoveryKeywords({
      countries,
      cities: parseList(body.cities),
      industry: body.industry,
      notes: body.notes,
    });
    return jsonOk(suggestions);
  }

  // Explicit checkbox sources (preferred). Legacy `method` still works.
  let useGoogleBusiness = body.useGoogleBusiness === true;
  let useSearchEngine = body.useSearchEngine === true;
  if (!useGoogleBusiness && !useSearchEngine) {
    if (body.method === 'search_engine') useSearchEngine = true;
    else if (body.method === 'google_places') useGoogleBusiness = true;
    else {
      // Default: Google Business when neither flag sent (older clients)
      useGoogleBusiness = body.useGoogleBusiness !== false && body.useSearchEngine !== true;
      useSearchEngine = body.useSearchEngine === true;
    }
  }

  const methods: Array<'google_places' | 'search_engine'> = [];
  if (useGoogleBusiness) methods.push('google_places');
  if (useSearchEngine) methods.push('search_engine');
  if (!methods.length) {
    return jsonError('Enable Google Business and/or Search engine discovery');
  }

  // Maps-first search only when explicitly requested (Places already covers GBP)
  const profileOnly = body.profileOnly === true;
  const keywords = parseList(body.keywords?.length ? body.keywords : body.keyword);
  const countries = parseList(body.countries?.length ? body.countries : body.country);
  const cities = parseList(body.cities?.length ? body.cities : body.city);
  const runAsync = body.async !== false; // default: Redis queue (chunked jobs)

  if (!keywords.length) {
    return jsonError('Add at least one keyword (or ask AI to suggest keywords)');
  }

  if (useGoogleBusiness && !useSearchEngine) {
    const { getDiscoveryConfig } = await import('@/lib/sales-agent/config');
    const discoveryCfg = await getDiscoveryConfig();
    if (!discoveryCfg.googlePlacesApiKey) {
      return jsonError(
        'Google Places API key not configured. Add it in Setup → Email & Discovery, or use Search engine only.'
      );
    }
  }

  const discoveryGroupId = body.discoveryGroupId ? Number(body.discoveryGroupId) : undefined;
  const groupLabel =
    typeof body.groupLabel === 'string' && body.groupLabel.trim()
      ? body.groupLabel.trim()
      : undefined;

  if (discoveryGroupId && Number.isNaN(discoveryGroupId)) {
    return jsonError('Invalid discovery group id');
  }

  const payload: {
    methods: Array<'google_places' | 'search_engine'>;
    profileOnly: boolean;
    keywords: string[];
    countries: string[];
    cities: string[];
    maxResults?: number;
    campaignId?: number;
    userId: number;
    discoveryGroupId?: number;
    groupLabel?: string;
    filters?: Record<string, unknown>;
  } = {
    methods,
    profileOnly,
    keywords,
    countries,
    cities,
    maxResults: body.maxResults ? Number(body.maxResults) : undefined,
    campaignId: body.campaignId ? Number(body.campaignId) : undefined,
    userId: gate.userId,
    discoveryGroupId,
    groupLabel,
  };

  if (methods.includes('google_places') && body.filters && typeof body.filters === 'object') {
    const f = body.filters;
    payload.filters = {
      maturity: f.maturity || 'any',
      maxReviewCount: f.maxReviewCount != null ? Number(f.maxReviewCount) : undefined,
      minReviewCount: f.minReviewCount != null ? Number(f.minReviewCount) : undefined,
      minRating: f.minRating != null ? Number(f.minRating) : undefined,
      website: f.website || 'any',
      includePureServiceArea: f.includePureServiceArea !== false,
      openNow: !!f.openNow,
    };
  }

  await saLog({
    category: 'user',
    action: 'discover_leads',
    message: `Multi discovery via ${methods.join('+')}: ${keywords.length} keywords × ${countries.length || 1} countries (async=${runAsync})`,
    userId: gate.userId,
    details: payload,
  });

  if (runAsync) {
    const queued = await enqueueMultiDiscovery(payload);
    return jsonOk({
      queued: true,
      chunks: queued.chunks,
      enqueued: queued.enqueued,
      ranInline: queued.ranInline,
      discoveryGroupId: queued.discoveryGroupId,
      group: queued.group,
      method: methods.length > 1 ? 'MIXED' : methods[0],
      methods,
      profileOnly,
      keywords,
      countries,
      cities,
      note:
        queued.enqueued > 0
          ? `Queued ${queued.enqueued} chunk job(s) into group “${queued.group?.label}”. Watch Job queue — UI refreshes when done.`
          : `Ran ${queued.ranInline} chunk(s) inline into group “${queued.group?.label}”.`,
    });
  }

  const result = await discoverMultiLocation(payload);
  return jsonOk({
    ...result,
    method: methods.length > 1 ? 'MIXED' : methods[0],
    methods,
    profileOnly,
    discoveryGroupId: result.discoveryGroupId,
  });
}
