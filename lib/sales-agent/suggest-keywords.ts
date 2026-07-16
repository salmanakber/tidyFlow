import { salesAgentChat, parseJsonLoose } from './ai-provider';
import { saLog } from './logger';

export interface KeywordSuggestions {
  keywords: string[];
  cities: string[];
  rationale: string;
}

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
  "keywords": ["8-12 search phrases that find cleaning businesses"],
  "cities": ["optional high-value cities in those countries if not already provided"],
  "rationale": "one short sentence"
}
Prefer commercial/office/industrial cleaning operators over freelancers.
Include local-language variants when useful (e.g. Spanish, German, French, Arabic).
Keywords should work in Google Places or web search.`,
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
    ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 15)
    : [];
  const cities = Array.isArray(parsed.cities)
    ? parsed.cities.map((c) => String(c).trim()).filter(Boolean).slice(0, 20)
    : [];

  await saLog({
    category: 'ai',
    action: 'suggest_keywords',
    message: `Suggested ${keywords.length} keywords for ${countries.join(', ')}`,
    details: { countries, keywords },
  });

  if (!keywords.length) {
    // Safe fallbacks
    return {
      keywords: countries.flatMap((c) => [
        `Cleaning Company ${c}`,
        `Commercial Cleaning ${c}`,
        `Office Cleaning ${c}`,
        `Janitorial Services ${c}`,
      ]).slice(0, 12),
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
