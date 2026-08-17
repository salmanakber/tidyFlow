import { salesAgentChat, parseJsonLoose } from './ai-provider';
import { saLog } from './logger';

export interface KeywordSuggestions {
  keywords: string[];
  cities: string[];
  rationale: string;
}

export interface SearchDirectiveSuggestions {
  directives: string[];
  rationale: string;
}

const MAX_KEYWORDS = 40;
const MAX_CITIES = 60;

/** Use AI to suggest high-intent cleaning-company search keywords for given countries. */
export async function suggestDiscoveryKeywords(input: {
  countries: string[];
  cities?: string[];
  industry?: string;
  notes?: string;
}): Promise<KeywordSuggestions> {
  const countries = input.countries.filter(Boolean);
  if (!countries.length) {
    throw new Error('Add at least one country for AI suggestions');
  }

  const result = await salesAgentChat(
    [
      {
        role: 'system',
        content: `You help a B2B SaaS (TidyFlow) find cleaning / janitorial / facilities companies to contact.
Return JSON only:
{
  "keywords": ["25-40 search phrases that find cleaning businesses"],
  "cities": ["major and mid-size cities across ALL listed countries — aim for 30-60 total when cities not provided"],
  "rationale": "one short sentence"
}
Prefer commercial/office/industrial cleaning operators over freelancers.
Include local-language variants when useful (e.g. Spanish, German, French, Arabic, Portuguese).
Keywords should work in Google Places or web search.
When countries are given without cities, list the largest metro areas AND secondary cities per country (not just capitals).
Cover niche terms: commercial cleaning, janitorial, office cleaning, carpet cleaning, post-construction, medical facility, industrial, strata, end-of-tenancy, etc.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          countries,
          cities: input.cities || [],
          industry: input.industry || 'cleaning companies',
          notes: input.notes || '',
        }),
      },
    ],
    { action: 'suggest_keywords', jsonMode: true }
  );

  const parsed = parseJsonLoose<KeywordSuggestions>(result.text);
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, MAX_KEYWORDS)
    : [];
  const cities = Array.isArray(parsed.cities)
    ? parsed.cities.map((c) => String(c).trim()).filter(Boolean).slice(0, MAX_CITIES)
    : [];

  await saLog({
    category: 'ai',
    action: 'suggest_keywords',
    message: `Suggested ${keywords.length} keywords, ${cities.length} cities for ${countries.join(', ')}`,
    details: { countries, keywordCount: keywords.length, cityCount: cities.length },
  });

  if (!keywords.length) {
    return {
      keywords: countries.flatMap((c) => [
        `Cleaning Company ${c}`,
        `Commercial Cleaning ${c}`,
        `Office Cleaning ${c}`,
        `Janitorial Services ${c}`,
        `Industrial Cleaning ${c}`,
        `Facilities Cleaning ${c}`,
        `Carpet Cleaning ${c}`,
        `Post Construction Cleaning ${c}`,
      ]).slice(0, 24),
      cities,
      rationale: 'Fallback keywords (AI returned empty list)',
    };
  }

  return {
    keywords,
    cities,
    rationale: parsed.rationale || 'AI keyword suggestions',
  };
}

/** Generate AI Search Directives lines tailored to current keywords & countries. */
export async function suggestSearchDirectives(input: {
  countries: string[];
  cities?: string[];
  keywords?: string[];
  industry?: string;
  existingNotes?: string;
}): Promise<SearchDirectiveSuggestions> {
  const countries = input.countries.filter(Boolean);
  const keywords = (input.keywords || []).map((k) => k.trim()).filter(Boolean);
  if (!countries.length && !keywords.length) {
    throw new Error('Add at least one country or keyword first');
  }

  const result = await salesAgentChat(
    [
      {
        role: 'system',
        content: `You write short "AI Search Directives" for a lead-discovery tool that finds cleaning companies.
Return JSON only:
{
  "directives": ["4-8 concise directive lines, each one sentence"],
  "rationale": "one short sentence"
}
Each directive should refine HOW to search — e.g. target commercial operators, avoid directories, prefer companies with websites, focus on multi-site firms, local language hints, contact-page email priority, exclude franchises above X size, etc.
Align directives with the keywords and countries provided. Do not repeat the keywords verbatim — add strategic guidance.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          countries,
          cities: input.cities || [],
          keywords: keywords.slice(0, 20),
          industry: input.industry || 'cleaning companies',
          existingNotes: input.existingNotes || '',
        }),
      },
    ],
    { action: 'suggest_directives', jsonMode: true }
  );

  const parsed = parseJsonLoose<SearchDirectiveSuggestions>(result.text);
  const directives = Array.isArray(parsed.directives)
    ? parsed.directives.map((d) => String(d).trim()).filter(Boolean).slice(0, 8)
    : [];

  await saLog({
    category: 'ai',
    action: 'suggest_directives',
    message: `Suggested ${directives.length} search directives`,
    details: { countries, keywordCount: keywords.length },
  });

  return {
    directives,
    rationale: parsed.rationale || 'AI search directives',
  };
}
