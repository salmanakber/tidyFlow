import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/**
 * GET /api/payroll/alerts
 * Actionable payroll items for manager/owner home banners.
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (!['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ success: true, data: { pendingHoursCount: 0, unpaidPayrollCount: 0, totalActionCount: 0 } });
  }

  const companyId = requireCompanyScope(tokenUser) || tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
  }

  try {
    const [pendingHoursCount, approvedUnpaidCount, pendingPayrollCount] = await Promise.all([
      prisma.workingHoursSubmission.count({
        where: { companyId, status: 'pending' },
      }),
      prisma.payrollRecord.count({
        where: { companyId, status: 'approved' },
      }),
      prisma.payrollRecord.count({
        where: { companyId, status: 'pending' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        pendingHoursCount,
        unpaidPayrollCount: approvedUnpaidCount,
        pendingPayrollCount,
        totalActionCount: pendingHoursCount + approvedUnpaidCount + pendingPayrollCount,
      },
    });
  } catch (error) {
    console.error('Payroll alerts error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
