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

  const method = (body.method === 'search_engine' ? 'search_engine' : 'google_places') as
    | 'google_places'
    | 'search_engine';
  const keywords = parseList(body.keywords?.length ? body.keywords : body.keyword);
  const countries = parseList(body.countries?.length ? body.countries : body.country);
  const cities = parseList(body.cities?.length ? body.cities : body.city);
  const runAsync = body.async !== false; // default: Redis queue (chunked jobs)

  if (!keywords.length) {
    return jsonError('Add at least one keyword (or ask AI to suggest keywords)');
  }

  const payload: {
    method: 'google_places' | 'search_engine';
    keywords: string[];
    countries: string[];
    cities: string[];
    maxResults?: number;
    campaignId?: number;
    userId: number;
  } = {
    method,
    keywords,
    countries,
    cities,
    maxResults: body.maxResults ? Number(body.maxResults) : undefined,
    campaignId: body.campaignId ? Number(body.campaignId) : undefined,
    userId: gate.userId,
  };

  await saLog({
    category: 'user',
    action: 'discover_leads',
    message: `Multi discovery via ${method}: ${keywords.length} keywords × ${countries.length || 1} countries (async=${runAsync})`,
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
      method,
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
  return jsonOk({ ...result, method, discoveryGroupId: result.discoveryGroupId });
}
