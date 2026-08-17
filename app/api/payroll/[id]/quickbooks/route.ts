import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyId, isManagerPlusRole } from '@/lib/rbac';
import { requireQuickBooksFeature } from '@/lib/subscription';
import { syncPayrollToQuickBooks } from '@/lib/quickbooks';
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

  const feature = await requireQuickBooksFeature(companyId);
  if (!feature.allowed) {
    return NextResponse.json({ success: false, message: feature.message }, { status: 403 });
  }

  const payrollId = Number(params.id);
  const record = await prisma.payrollRecord.findFirst({
    where: { id: payrollId, companyId },
  });
  if (!record) {
    return NextResponse.json({ success: false, message: 'Payroll record not found' }, { status: 404 });
  }

  const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!conn) {
    return NextResponse.json({ success: false, message: 'QuickBooks not connected' }, { status: 400 });
  }

  try {
    const result = await syncPayrollToQuickBooks(companyId, payrollId);
    const updated = await prisma.payrollRecord.findUnique({ where: { id: payrollId } });
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        payroll: updated
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
