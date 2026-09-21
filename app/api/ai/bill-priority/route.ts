import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { getAIConfig, isAIEnabled, hasAIProviderKeys, aiChat, parseJSONResponse } from '@/lib/ai';
import { requireAIFeature, logAIUsage } from '@/lib/subscription';
import { getRequestLocale } from '@/lib/locale';

type ClientGroupIn = {
  key: string;
  label: string;
  taskCount: number;
  estimatedTotal: number;
};

/**
 * Rank ready-to-bill client groups using company AI config.
 * Suggest order only — client still confirms draft.
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
    const groups = (Array.isArray(body?.groups) ? body.groups : []) as ClientGroupIn[];
    const locale = getRequestLocale(request, body);

    if (!groups.length) {
      return NextResponse.json({ success: true, data: { ranked: [], aiGenerated: false } });
    }

    const config = await getAIConfig(companyId);
    if (!isAIEnabled(config) || !hasAIProviderKeys(config) || !config.insightsEnabled) {
      return NextResponse.json({
        success: true,
        data: {
          ranked: groups.slice(0, 8).map((g, i) => ({
            key: g.key,
            priority: i + 1,
            reason: 'Highest job count / estimate (rules)',
          })),
          aiGenerated: false,
        },
      });
    }

    const aiCheck = await requireAIFeature(companyId, 'insights');
    if (!aiCheck.allowed) {
      return NextResponse.json({ success: false, message: aiCheck.message }, { status: 403 });
    }

    const compact = groups.slice(0, 20).map((g) => ({
      key: g.key,
      label: g.label,
      taskCount: g.taskCount,
      estimatedTotal: g.estimatedTotal,
    }));

    const result = await aiChat(
      [
        {
          role: 'system',
          content: `You help a cleaning ops manager decide which clients to invoice first.
Return ONLY JSON: {"ranked":[{"key":"exact-key-from-input","priority":1,"reason":"one short sentence"}]}
Prioritize: larger unpaid work, more completed jobs, clear client identity. Use exact key strings from input.`,
        },
        { role: 'user', content: JSON.stringify(compact) },
      ],
      { companyId, jsonMode: true, temperature: 0.2, maxTokens: 800, locale }
    );

    const parsed = parseJSONResponse<{ ranked?: { key: string; priority: number; reason: string }[] }>(
      result.text
    );
    const keySet = new Set(compact.map((g) => g.key));
    const ranked = (Array.isArray(parsed?.ranked) ? parsed.ranked : [])
      .filter((r) => r && keySet.has(String(r.key)))
      .slice(0, 8)
      .map((r, i) => ({
        key: String(r.key),
        priority: Number(r.priority) || i + 1,
        reason: String(r.reason || 'Suggested by AI').slice(0, 160),
      }));

    // Ensure all top groups appear even if model omitted some
    for (const g of compact.slice(0, 6)) {
      if (!ranked.some((r) => r.key === g.key)) {
        ranked.push({ key: g.key, priority: ranked.length + 1, reason: 'Additional billable client' });
      }
    }

    await logAIUsage(companyId, 'insights');

    return NextResponse.json({
      success: true,
      data: { ranked: ranked.slice(0, 8), aiGenerated: true, provider: result.provider },
    });
  } catch (error: any) {
    console.error('AI bill-priority error:', error);
    return NextResponse.json({
      success: true,
      data: { ranked: [], aiGenerated: false, reason: 'ai_error' },
    });
  }
}
