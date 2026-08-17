import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  generatePartnerToken,
  generateReferralCode,
  hashPartnerPassword,
  requirePartnersAdmin,
  serializePartner,
  syncPartnerCommissions,
} from '@/lib/partners';

/** GET /api/admin/partners — list marketers & investors */
export async function GET(request: NextRequest) {
  const auth = requirePartnersAdmin(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // MARKETER | INVESTOR | all

  const where: any = {};
  if (type === 'MARKETER' || type === 'INVESTOR') where.type = type;

  const partners = await (prisma as any).partner.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          referredCompanies: true,
          commissions: true,
          payouts: true,
          referrals: true,
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: partners.map((p: any) => ({
      ...serializePartner(p),
      counts: p._count,
    })),
  });
}

/** POST /api/admin/partners — create marketer or investor */
export async function POST(request: NextRequest) {
  const auth = requirePartnersAdmin(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');
    const type = body.type === 'INVESTOR' ? 'INVESTOR' : 'MARKETER';

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and temporary password are required' },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const existing = await (prisma as any).partner.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: 'A partner with this email already exists' },
        { status: 409 }
      );
    }

    let referralCode: string | null = null;
    if (type === 'MARKETER') {
      referralCode = String(body.referralCode || generateReferralCode(body.firstName || email))
        .trim()
        .toUpperCase();
      const codeTaken = await (prisma as any).partner.findUnique({ where: { referralCode } });
      if (codeTaken) referralCode = generateReferralCode(email);
    }

    const passwordHash = await hashPartnerPassword(password);
    const partner = await (prisma as any).partner.create({
      data: {
        type,
        status: body.status || 'ACTIVE',
        email,
        passwordHash,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        companyName: body.companyName || null,
        phone: body.phone || null,
        referralCode,
        commissionPercent: type === 'MARKETER' ? Number(body.commissionPercent ?? 10) : 0,
        notes: body.notes || null,
        payoutDetails: body.payoutDetails || null,
        investmentAmount: type === 'INVESTOR' ? Number(body.investmentAmount || 0) : null,
        equityPercent: type === 'INVESTOR' ? Number(body.equityPercent || 0) : null,
        investmentDate: body.investmentDate ? new Date(body.investmentDate) : null,
        investmentCurrency: body.investmentCurrency || 'USD',
        boardObserver: Boolean(body.boardObserver),
        termSheetUrl: body.termSheetUrl || null,
        dataRoomNotes: body.dataRoomNotes || null,
      },
    });

    if (type === 'MARKETER') {
      await syncPartnerCommissions(partner.id).catch(() => null);
    }

    const token = generatePartnerToken({
      partnerId: partner.id,
      email: partner.email,
      type: partner.type,
    });

    return NextResponse.json({
      success: true,
      data: {
        partner: serializePartner(partner),
        temporaryPassword: password,
        // Admin can share portal login URL; token not required for admin UX
        portalLoginHint: '/partner/login',
        referralLink:
          type === 'MARKETER' && partner.referralCode
            ? `/account/login?ref=${partner.referralCode}`
            : null,
        issuedJwtPreview: token ? true : false,
      },
    });
  } catch (err: any) {
    console.error('Create partner error', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to create partner' },
      { status: 500 }
    );
  }
}
