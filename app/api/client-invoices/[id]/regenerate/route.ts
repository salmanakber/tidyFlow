import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { requireInvoiceFeature } from '@/lib/subscription';
import { regenerateClientInvoice } from '@/lib/client-invoice';
import { UserRole } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const limitCheck = await requireInvoiceFeature(companyId);
  if (!limitCheck.allowed) {
    return NextResponse.json({ success: false, message: limitCheck.message }, { status: 403 });
  }

  const invoiceId = Number(params.id);
  const invoice = await prisma.clientInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { task: true },
  });

  if (!invoice) {
    return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { useAI = false, voidPrevious = true } = body;

    const updated = await regenerateClientInvoice(invoiceId, {
      useAI: !!useAI,
      voidPrevious: voidPrevious !== false,
      createdById: auth.tokenUser.userId,
      locale: (body as any)?.locale,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        lineItems: JSON.parse(updated.lineItems),
        subtotal: Number(updated.subtotal),
        totalAmount: Number(updated.totalAmount),
      },
    });
  } catch (error: any) {
    console.error('Invoice regenerate error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to regenerate invoice' },
      { status: 500 }
    );
  }
}
