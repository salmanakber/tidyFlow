import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { buildBankExport, type BankExportFormat } from '@/lib/payroll-bank-export';
import { getCompanyCurrency } from '@/lib/company-config';

/**
 * POST /api/payroll/export
 * Export bank clearing file (CSV, SEPA XML, or ABA) for approved/paid payroll records.
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (
    role !== UserRole.OWNER &&
    role !== UserRole.DEVELOPER &&
    role !== UserRole.COMPANY_ADMIN &&
    role !== UserRole.MANAGER
  ) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { payrollRecordIds, format = 'csv', returnJson = false } = body as {
      payrollRecordIds: number[];
      format?: BankExportFormat;
      returnJson?: boolean;
    };

    if (!Array.isArray(payrollRecordIds) || payrollRecordIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'payrollRecordIds array is required' },
        { status: 400 },
      );
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const exportFormat: BankExportFormat =
      format === 'sepa' || format === 'aba' ? format : 'csv';

    const records = await prisma.payrollRecord.findMany({
      where: {
        id: { in: payrollRecordIds.map(Number) },
        companyId,
        status: { in: ['approved', 'paid'] },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bankAccountNumber: true,
            bankName: true,
            bankSortCode: true,
          },
        },
        company: {
          select: {
            name: true,
            invoiceSettings: {
              select: {
                companyDisplayName: true,
              },
            },
          },
        },
      },
    });

    if (records.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No approved or paid payroll records found for export' },
        { status: 404 },
      );
    }

    const companyName =
      records[0].company.invoiceSettings?.companyDisplayName || records[0].company.name;

    const currency = await getCompanyCurrency(companyId);

    const payees = records.map((r) => ({
      id: r.id,
      name: `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || `Employee ${r.userId}`,
      amount: Number(r.netSalary ?? r.totalAmount),
      currency,
      accountNumber: r.user.bankAccountNumber,
      sortCode: r.user.bankSortCode,
      bankName: r.user.bankName,
      reference: `PAY-${r.id}-${new Date(r.periodEnd).toISOString().slice(0, 10)}`,
    }));

    const { content, mimeType, extension } = buildBankExport(
      exportFormat,
      { name: companyName },
      payees,
    );

    const exportRef = `EXP-${Date.now()}`;
    await prisma.payrollRecord.updateMany({
      where: { id: { in: records.map((r) => r.id) } },
      data: { paymentExportRef: exportRef },
    });

    const filename = `payroll-${exportRef}.${extension}`;

    if (returnJson) {
      return NextResponse.json({
        success: true,
        data: { content, filename, mimeType, extension, exportRef, recordCount: records.length },
      });
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Ref': exportRef,
        'X-Record-Count': String(records.length),
      },
    });
  } catch (error: unknown) {
    console.error('Payroll export error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
