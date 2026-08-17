import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { requireAIFeature, logAIUsage } from '@/lib/subscription';
import { getRequestLocale } from '@/lib/locale';
import { generateRevenueAnalysis } from '@/lib/ai/revenue-report-analysis';

/**
 * POST /api/ai/revenue-analysis
 * Body: { from, to, focus?, propertyId?, report, locale? }
 * Uses the already-computed revenue report payload + AI narrative in app locale.
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
    const body = await request.json().catch(() => ({}));
    const locale = getRequestLocale(request, body);
    const from = typeof body.from === 'string' ? body.from : null;
    const to = typeof body.to === 'string' ? body.to : null;
    const report = body.report;

    if (!from || !to || !report?.summary) {
      return NextResponse.json(
        { success: false, message: 'from, to, and report.summary are required' },
        { status: 400 }
      );
    }

    const aiCheck = await requireAIFeature(companyId, 'insights');
    if (!aiCheck.allowed) {
      return NextResponse.json({ success: false, message: aiCheck.message }, { status: 403 });
    }

    const analysis = await generateRevenueAnalysis({
      companyId,
      from,
      to,
      locale,
      focus: body.focus || 'overall',
      propertyId: body.propertyId != null ? Number(body.propertyId) : null,
      report,
    });

    if (analysis.aiGenerated) {
      await logAIUsage(companyId, 'insights');
    }

    return NextResponse.json({ success: true, data: analysis });
  } catch (error) {
    console.error('AI revenue analysis error:', error);
    return NextResponse.json({ success: false, message: 'Failed to analyze revenue' }, { status: 500 });
  }
}
