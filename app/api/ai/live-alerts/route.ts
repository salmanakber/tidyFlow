import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { getAIConfig, isAIEnabled, hasAIProviderKeys, aiChat, parseJSONResponse } from '@/lib/ai';
import { requireAIFeature, logAIUsage } from '@/lib/subscription';
import { getRequestLocale } from '@/lib/locale';

/**
 * Smart live-ops alerts via company AI config.
 * Suggest only — manager confirms any action.
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
    const locale = getRequestLocale(request, body);
    const snapshot = {
      coveragePct: body?.coveragePct,
      offSite: body?.offSite,
      stale: body?.stale,
      noGps: body?.noGps,
      sosCount: body?.sosCount,
      exceptions: Array.isArray(body?.exceptions) ? body.exceptions.slice(0, 12) : [],
    };

    const config = await getAIConfig(companyId);
    if (!isAIEnabled(config) || !hasAIProviderKeys(config) || !config.insightsEnabled) {
      return NextResponse.json({
        success: true,
        data: { alerts: ruleAlerts(snapshot), aiGenerated: false },
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
          content: `You are a fleet ops advisor for a cleaning company live monitor.
Return ONLY JSON: {"alerts":[{"id":"slug","severity":"critical|high|medium","title":"short","detail":"one sentence action suggestion","action":"check_in|open_job|resolve_sos|ignore"}]}
Max 4 alerts. Only raise when something needs a manager. Be concrete. Prefer check_in for off-site dwell.`,
        },
        { role: 'user', content: JSON.stringify(snapshot) },
      ],
      { companyId, jsonMode: true, temperature: 0.2, maxTokens: 600, locale }
    );

    const parsed = parseJSONResponse<{ alerts?: any[] }>(result.text);
    const alerts = (Array.isArray(parsed?.alerts) ? parsed.alerts : [])
      .slice(0, 4)
      .map((a, i) => ({
        id: String(a.id || `alert-${i}`).slice(0, 48),
        severity: ['critical', 'high', 'medium'].includes(a.severity) ? a.severity : 'medium',
        title: String(a.title || 'Ops alert').slice(0, 80),
        detail: String(a.detail || '').slice(0, 180),
        action: String(a.action || 'check_in').slice(0, 32),
      }));

    await logAIUsage(companyId, 'insights');

    return NextResponse.json({
      success: true,
      data: { alerts, aiGenerated: true, provider: result.provider },
    });
  } catch (error: any) {
    console.error('AI live-alerts error:', error);
    return NextResponse.json({
      success: true,
      data: { alerts: [], aiGenerated: false, reason: 'ai_error' },
    });
  }
}

function ruleAlerts(s: any) {
  const alerts: any[] = [];
  if ((s.sosCount || 0) > 0) {
    alerts.push({
      id: 'rule-sos',
      severity: 'critical',
      title: 'Open SOS needs response',
      detail: 'Acknowledge and contact the cleaner immediately.',
      action: 'resolve_sos',
    });
  }
  if ((s.offSite || 0) > 0) {
    alerts.push({
      id: 'rule-offsite',
      severity: 'high',
      title: `${s.offSite} cleaner(s) off-site`,
      detail: 'Check whether they are on a break, traveling between jobs, or need help.',
      action: 'check_in',
    });
  }
  if ((s.noGps || 0) > 0 && (s.coveragePct || 100) < 70) {
    alerts.push({
      id: 'rule-coverage',
      severity: 'medium',
      title: 'Low GPS coverage',
      detail: 'Ask cleaners to open the app and enable location for active jobs.',
      action: 'check_in',
    });
  }
  return alerts;
}
