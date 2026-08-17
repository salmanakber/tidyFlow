import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { generateCompanyInsights } from '@/lib/ai';
import { requireAIFeature, logAIUsage } from '@/lib/subscription';
import { withAIActivityGuard, companyActivityFingerprint } from '@/lib/ai/activity-queue';
import { getRequestLocale } from '@/lib/locale';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Company required. Select a company in the admin header, or pass ?companyId= in the request.',
      },
      { status: 400 }
    );
  }

  try {
    const insights = await prisma.aIInsight.findMany({
      where: { companyId, dismissedAt: null },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    return NextResponse.json({ success: true, data: insights });
  } catch (error) {
    console.error('AI insights GET error:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch insights' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Company required. Select a company in the admin header, or pass ?companyId= in the request.',
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const locale = getRequestLocale(request, body);
    const aiCheck = await requireAIFeature(companyId, 'insights');
    if (!aiCheck.allowed) {
      return NextResponse.json({ success: false, message: aiCheck.message }, { status: 403 });
    }

    const { data: created, fromCache } = await withAIActivityGuard(
      {
        companyId,
        feature: 'insights',
        scopeKey: 'company',
        getFingerprint: () => companyActivityFingerprint(companyId),
      },
      () => generateCompanyInsights(companyId, locale)
    );

    if (!fromCache) await logAIUsage(companyId, 'insights');

    return NextResponse.json({ success: true, data: created, fromCache });
  } catch (error) {
    console.error('AI insights POST error:', error);
    return NextResponse.json({ success: false, message: 'Failed to generate insights' }, { status: 500 });
  }
}
