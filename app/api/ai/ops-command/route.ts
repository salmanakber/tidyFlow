import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { getAIConfig, isAIEnabled, hasAIProviderKeys, aiChat, parseJSONResponse } from '@/lib/ai';
import { requireAIFeature, logAIUsage } from '@/lib/subscription';
import { getRequestLocale } from '@/lib/locale';

type CommandHit = {
  id: string;
  label: string;
  hrefKey: string;
  query?: string;
  detail?: string;
};

const ALLOWED_HREF_KEYS = new Set([
  'jobs',
  'invoices',
  'rota',
  'monitor',
  'safety',
  'payroll',
  'expenses',
  'calendar',
  'dashboard',
  'issues',
  'digests',
  'team',
  'properties',
]);

/**
 * Natural-language → ops deep-link via company AI config (Groq/Google).
 * Falls back to empty when AI disabled — client uses rule parser.
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const query = String(body?.query || '').trim().slice(0, 200);
    const locale = getRequestLocale(request, body);

    if (query.length < 2) {
      return NextResponse.json({ success: true, data: { commands: [], aiGenerated: false } });
    }

    const config = await getAIConfig(companyId);
    if (!isAIEnabled(config) || !hasAIProviderKeys(config) || !config.insightsEnabled) {
      return NextResponse.json({
        success: true,
        data: { commands: [], aiGenerated: false, reason: 'ai_disabled' },
      });
    }

    const aiCheck = await requireAIFeature(companyId, 'insights');
    if (!aiCheck.allowed) {
      return NextResponse.json({ success: false, message: aiCheck.message }, { status: 403 });
    }

    const result = await aiChat(
      [
        {
          role: 'system',
          content: `You are TidyFlow ops command parser for cleaning company managers.
Map the user message to 1-4 workspace deep links.
Return ONLY JSON: {"commands":[{"id":"slug","label":"short label","hrefKey":"jobs|invoices|rota|monitor|safety|payroll|expenses|calendar|dashboard|issues|digests|team|properties","query":"optional url query without ?","detail":"one line why"}]}
Rules:
- hrefKey must be one of the allowed keys.
- Prefer actionable destinations (unassigned jobs, create invoice, smart fill rota, SOS, live map).
- query examples: status=unassigned, create=1, smart=1, tab=sos, task=123, q=smith
- Never invent hrefKey outside the allow-list.`,
        },
        { role: 'user', content: query },
      ],
      { companyId, jsonMode: true, temperature: 0.1, maxTokens: 500, locale }
    );

    const parsed = parseJSONResponse<{ commands?: CommandHit[] }>(result.text);
    const raw = Array.isArray(parsed?.commands) ? parsed.commands : [];
    const commands = raw
      .filter((c) => c && ALLOWED_HREF_KEYS.has(String(c.hrefKey)))
      .slice(0, 4)
      .map((c, i) => ({
        id: String(c.id || `ai-${i}`).slice(0, 64),
        label: String(c.label || c.hrefKey).slice(0, 80),
        hrefKey: String(c.hrefKey),
        query: c.query ? String(c.query).replace(/^\?/, '').slice(0, 120) : undefined,
        detail: c.detail ? String(c.detail).slice(0, 120) : undefined,
      }));

    await logAIUsage(companyId, 'insights');

    return NextResponse.json({
      success: true,
      data: { commands, aiGenerated: true, provider: result.provider },
    });
  } catch (error: any) {
    console.error('AI ops-command error:', error);
    return NextResponse.json({
      success: true,
      data: { commands: [], aiGenerated: false, reason: 'ai_error' },
    });
  }
}
