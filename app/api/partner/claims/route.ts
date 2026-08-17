import { NextRequest, NextResponse } from 'next/server';
import {
  requirePartnerAuth,
  submitClientClaim,
  validateClientClaimForMarketer,
} from '@/lib/partners';
import prisma from '@/lib/prisma';

/** GET /api/partner/claims — marketer's own client claims */
export async function GET(request: NextRequest) {
  const auth = requirePartnerAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (auth.type !== 'MARKETER') {
    return NextResponse.json({ success: false, message: 'Marketers only' }, { status: 403 });
  }

  const claims = await (prisma as any).partnerClientClaim.findMany({
    where: { partnerId: auth.partnerId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      company: {
        select: { id: true, name: true, subscriptionStatus: true, planTier: true },
      },
    },
  });

  return NextResponse.json({ success: true, data: claims });
}

/** POST /api/partner/claims — validate + submit claim for admin review */
export async function POST(request: NextRequest) {
  const auth = requirePartnerAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (auth.type !== 'MARKETER') {
    return NextResponse.json({ success: false, message: 'Marketers only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const customerEmail = String(body.customerEmail || '').trim();
  const note = body.note ? String(body.note) : undefined;
  const dryRun = Boolean(body.validateOnly);

  if (dryRun) {
    const validation = await validateClientClaimForMarketer({
      partnerId: auth.partnerId,
      customerEmail,
    });
    return NextResponse.json({
      success: validation.ok,
      message: validation.message,
      code: validation.ok ? 'OK' : (validation as any).code,
      data: validation.ok
        ? {
            company: {
              id: validation.company.id,
              name: validation.company.name,
              subscriptionStatus: validation.company.subscriptionStatus,
              planTier: validation.company.planTier,
            },
            user: {
              email: validation.user.email,
              name: [validation.user.firstName, validation.user.lastName]
                .filter(Boolean)
                .join(' '),
            },
          }
        : null,
    });
  }

  const result = await submitClientClaim({
    partnerId: auth.partnerId,
    customerEmail,
    note,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.message,
        code: (result as any).code,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, message: result.message, data: result.claim });
}
