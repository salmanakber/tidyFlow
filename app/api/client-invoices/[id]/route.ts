import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { maybeAutoSyncInvoice } from '@/lib/quickbooks';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(_request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  const invoice = await prisma.clientInvoice.findFirst({
    where: { id: Number(params.id), ...(companyId ? { companyId } : {}) },
    include: {
      task: { select: { id: true, title: true } },
      property: { select: { address: true } },
      company: { select: { name: true } },
    },
  });

  if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      ...invoice,
      lineItems: JSON.parse(invoice.lineItems),
      subtotal: Number(invoice.subtotal),
      totalAmount: Number(invoice.totalAmount),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  const body = await request.json();
  const { status } = body;

  const invoice = await prisma.clientInvoice.findFirst({
    where: { id: Number(params.id), ...(companyId ? { companyId } : {}) },
  });
  if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const updated = await prisma.clientInvoice.update({
    where: { id: invoice.id },
    data: {
      ...(status ? { status, ...(status === 'paid' ? { paidAt: new Date() } : {}) } : {}),
    },
  });

  if (status === 'paid') {
    await maybeAutoSyncInvoice(invoice.companyId, invoice.id, 'paid');
  }

  return NextResponse.json({ success: true, data: updated });
}
