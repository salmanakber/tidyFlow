import { normalizeWebsite } from './discovery';
import { isDirectoryHost } from './discovery-filters';
import { parseJsonLoose, salesAgentChat } from './ai-provider';
import { saLog } from './logger';

export type SearchHit = { url: string; title?: string; snippet?: string };

/**
 * Keep direct cleaning-company websites from search results.
 * Uses a fast host blocklist, then AI to drop directories / listicles / aggregators.
 * Does not call Google Places.
 */
export async function filterSearchHitsForRealBusinesses(
  hits: SearchHit[],
  keyword: string,
  opts?: { userId?: number }
): Promise<{ kept: SearchHit[]; aiFiltered: number; staticFiltered: number }> {
  const staticFiltered: SearchHit[] = [];
  let staticDropped = 0;

  for (const hit of hits) {
    const host = normalizeWebsite(hit.url);
    if (!host || isDirectoryHost(host)) {
      staticDropped++;
      continue;
    }
    staticFiltered.push(hit);
  }

  if (!staticFiltered.length) {
    return { kept: [], aiFiltered: 0, staticFiltered: staticDropped };
  }

  const batch = staticFiltered.slice(0, 28);
  try {
    const items = batch.map((h, i) => ({
      i,
      url: h.url.split('?')[0],
      host: normalizeWebsite(h.url),
      title: (h.title || '').slice(0, 140),
      snippet: (h.snippet || '').slice(0, 220),
    }));

    const { text, provider } = await salesAgentChat(
      [
        {
          role: 'system',
          content: `You filter web search hits for a B2B tool that finds independent cleaning / janitorial companies.
REJECT (keep=false): business directories, review aggregators, marketplaces, social profiles, job boards, Wikipedia/news, "top 10" listicles, franchise portals, lead-gen sites, government pages, generic SaaS unrelated to cleaning.
KEEP (keep=true): websites that look like a real cleaning/janitorial company (local operator or regional firm).
When unsure, prefer keep=true only if title/snippet/URL strongly suggest an actual cleaning business.
Return JSON only: { "results": [ { "i": number, "keep": boolean } ] }`,
        },
        {
          role: 'user',
          content: JSON.stringify({ keyword, items }),
        },
      ],
      { action: 'search_hit_filter', jsonMode: true }
    );

    const parsed = parseJsonLoose<{ results?: Array<{ i: number; keep: boolean }> }>(text);
    const decisions = new Map<number, boolean>();
    for (const row of parsed.results || []) {
      if (typeof row?.i === 'number') decisions.set(row.i, !!row.keep);
    }

    const kept: SearchHit[] = [];
    let aiDropped = 0;
    for (let i = 0; i < batch.length; i++) {
      if (decisions.get(i) === false) {
        aiDropped++;
        continue;
      }
      kept.push(batch[i]);
    }

    await saLog({
      category: 'search',
      action: 'ai_hit_filter',
      message: `AI kept ${kept.length}/${batch.length} search hits (${provider})`,
      userId: opts?.userId,
      details: { keyword, staticDropped, aiDropped, provider },
    });

    return { kept, aiFiltered: aiDropped, staticFiltered: staticDropped };
  } catch (err: any) {
    await saLog({
      level: 'warn',
      category: 'search',
      action: 'ai_hit_filter_fallback',
      message: err?.message || 'AI filter unavailable — using host blocklist only',
      userId: opts?.userId,
      success: false,
    });
    return { kept: staticFiltered, aiFiltered: 0, staticFiltered: staticDropped };
  }
}
