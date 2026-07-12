import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyId, isManagerPlusRole } from '@/lib/rbac';
import { syncClientInvoiceToQuickBooks } from '@/lib/quickbooks';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (!isManagerPlusRole(auth.tokenUser.role as UserRole)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  let companyId = resolveCompanyId(request, auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const invoiceId = Number(params.id);
  const invoice = await prisma.clientInvoice.findFirst({
    where: { id: invoiceId, companyId },
  });
  if (!invoice) {
    return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
  }

  const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!conn) {
    return NextResponse.json({ success: false, message: 'QuickBooks not connected' }, { status: 400 });
  }

  try {
    const result = await syncClientInvoiceToQuickBooks(companyId, invoiceId);
    const updated = await prisma.clientInvoice.findUnique({ where: { id: invoiceId } });
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        invoice: updated
          ? {
              id: updated.id,
              quickbooksSyncStatus: updated.quickbooksSyncStatus,
              quickbooksSyncedAt: updated.quickbooksSyncedAt?.toISOString(),
              quickbooksDocNumber: updated.quickbooksDocNumber,
              quickbooksSyncError: updated.quickbooksSyncError,
            }
          : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
