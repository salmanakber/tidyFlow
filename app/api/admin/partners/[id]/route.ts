import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  getInvestorDashboard,
  getMarketerDashboard,
  hashPartnerPassword,
  requirePartnersAdmin,
  serializePartner,
  syncPartnerCommissions,
} from '@/lib/partners';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = requirePartnersAdmin(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const partnerId = parseInt(id, 10);
  if (!partnerId) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const partner = await (prisma as any).partner.findUnique({ where: { id: partnerId } });
  if (!partner) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  if (partner.type === 'INVESTOR') {
    const dash = await getInvestorDashboard(partnerId);
    return NextResponse.json({ success: true, data: dash });
  }

  await syncPartnerCommissions(partnerId).catch(() => null);
  const dash = await getMarketerDashboard(partnerId);
  return NextResponse.json({ success: true, data: dash });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = requirePartnersAdmin(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const partnerId = parseInt(id, 10);
  const body = await request.json();

  const data: any = {};
  const fields = [
    'firstName',
    'lastName',
    'companyName',
    'phone',
    'notes',
    'payoutDetails',
    'status',
    'termSheetUrl',
    'dataRoomNotes',
    'investmentCurrency',
  ] as const;
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (body.commissionPercent !== undefined) data.commissionPercent = Number(body.commissionPercent);
  if (body.investmentAmount !== undefined) data.investmentAmount = Number(body.investmentAmount);
  if (body.equityPercent !== undefined) data.equityPercent = Number(body.equityPercent);
  if (body.boardObserver !== undefined) data.boardObserver = Boolean(body.boardObserver);
  if (body.investmentDate !== undefined) {
    data.investmentDate = body.investmentDate ? new Date(body.investmentDate) : null;
  }
  if (body.referralCode !== undefined) {
    data.referralCode = String(body.referralCode).trim().toUpperCase() || null;
  }
  if (body.password) {
    data.passwordHash = await hashPartnerPassword(String(body.password));
  }

  try {
    const partner = await (prisma as any).partner.update({
      where: { id: partnerId },
      data,
    });
    return NextResponse.json({ success: true, data: serializePartner(partner) });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || 'Update failed' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = requirePartnersAdmin(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const partnerId = parseInt(id, 10);
  await (prisma as any).partner.delete({ where: { id: partnerId } });
  return NextResponse.json({ success: true });
}
