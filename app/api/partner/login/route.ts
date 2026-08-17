import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  generatePartnerToken,
  requirePartnerAuth,
  serializePartner,
  verifyPartnerPassword,
} from '@/lib/partners';

/** POST /api/partner/login */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password required' },
        { status: 400 }
      );
    }

    const partner = await (prisma as any).partner.findUnique({ where: { email } });
    if (!partner || partner.status === 'SUSPENDED' || partner.status === 'INACTIVE') {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials or inactive account' },
        { status: 401 }
      );
    }

    const ok = await verifyPartnerPassword(password, partner.passwordHash);
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    await (prisma as any).partner.update({
      where: { id: partner.id },
      data: { lastLoginAt: new Date() },
    });

    const token = generatePartnerToken({
      partnerId: partner.id,
      email: partner.email,
      type: partner.type,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        token,
        partner: serializePartner(partner),
      },
    });

    response.cookies.set('partnerAuthToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });
    // Do not set admin authToken
    response.cookies.set('authToken', '', { httpOnly: true, path: '/', maxAge: 0 });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || 'Login failed' },
      { status: 500 }
    );
  }
}

/** GET /api/partner/login — session check */
export async function GET(request: NextRequest) {
  const auth = requirePartnerAuth(request);
  if (!auth) return NextResponse.json({ success: false }, { status: 401 });
  const partner = await (prisma as any).partner.findUnique({ where: { id: auth.partnerId } });
  if (!partner) return NextResponse.json({ success: false }, { status: 401 });
  return NextResponse.json({ success: true, data: serializePartner(partner) });
}
