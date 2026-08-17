import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePartnersAdmin, syncPartnerCommissions } from '@/lib/partners';

type Ctx = { params: Promise<{ id: string }> };

/** POST actions: sync-commissions | approve-commissions | create-payout | mark-payout-paid | add-document | publish-update */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = requirePartnersAdmin(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const partnerId = parseInt(id, 10);
  const body = await request.json();
  const action = String(body.action || '');

  const partner = await (prisma as any).partner.findUnique({ where: { id: partnerId } });
  if (!partner) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  try {
    if (action === 'sync-commissions') {
      const result = await syncPartnerCommissions(partnerId);
      return NextResponse.json({ success: true, data: result });
    }

    if (action === 'approve-commissions') {
      const ids: number[] = Array.isArray(body.commissionIds) ? body.commissionIds.map(Number) : [];
      const res = await (prisma as any).partnerCommission.updateMany({
        where: {
          partnerId,
          id: ids.length ? { in: ids } : undefined,
          status: 'PENDING',
        },
        data: { status: 'APPROVED' },
      });
      return NextResponse.json({ success: true, data: { updated: res.count } });
    }

    if (action === 'create-payout') {
      const commissionIds: number[] = Array.isArray(body.commissionIds)
        ? body.commissionIds.map(Number)
        : [];
      const commissions = await (prisma as any).partnerCommission.findMany({
        where: {
          partnerId,
          status: 'APPROVED',
          ...(commissionIds.length ? { id: { in: commissionIds } } : {}),
          payoutId: null,
        },
      });
      if (!commissions.length) {
        return NextResponse.json(
          { success: false, message: 'No approved unpaid commissions to payout' },
          { status: 400 }
        );
      }
      const amount = commissions.reduce(
        (s: number, c: any) => s + Number(c.commissionAmount || 0),
        0
      );
      const payout = await (prisma as any).partnerPayout.create({
        data: {
          partnerId,
          amount,
          status: 'PENDING',
          method: body.method || 'bank_transfer',
          reference: body.reference || null,
          notes: body.notes || null,
        },
      });
      await (prisma as any).partnerCommission.updateMany({
        where: { id: { in: commissions.map((c: any) => c.id) } },
        data: { payoutId: payout.id, status: 'PAID' },
      });
      return NextResponse.json({ success: true, data: payout });
    }

    if (action === 'mark-payout-paid') {
      const payoutId = Number(body.payoutId);
      const payout = await (prisma as any).partnerPayout.update({
        where: { id: payoutId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          reference: body.reference || undefined,
          method: body.method || undefined,
        },
      });
      return NextResponse.json({ success: true, data: payout });
    }

    if (action === 'add-document') {
      const doc = await (prisma as any).partnerDocument.create({
        data: {
          partnerId,
          title: String(body.title || 'Document'),
          url: String(body.url || ''),
          category: String(body.category || 'general'),
        },
      });
      return NextResponse.json({ success: true, data: doc });
    }

    if (action === 'publish-update') {
      const update = await (prisma as any).investorUpdate.create({
        data: {
          partnerId: body.broadcastToAll ? null : partnerId,
          title: String(body.title || 'Update'),
          body: String(body.body || ''),
          metricsJson: body.metrics ? JSON.stringify(body.metrics) : null,
          isPublished: true,
          publishedAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, data: update });
    }

    if (action === 'manual-referral') {
      const companyId = Number(body.companyId);
      const company = await (prisma as any).company.findUnique({ where: { id: companyId } });
      if (!company) {
        return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
      }
      await (prisma as any).company.update({
        where: { id: companyId },
        data: { referredByPartnerId: partnerId },
      });
      await (prisma as any).partnerReferral.create({
        data: {
          partnerId,
          companyId,
          registeredEmail: String(body.email || `company-${companyId}@manual.local`),
          companyName: company.name,
          attributionNote: body.note || 'Manually attributed by admin',
        },
      });
      await syncPartnerCommissions(partnerId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Partner action error', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Action failed' },
      { status: 500 }
    );
  }
}
