import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function serializePayrollRecord(record: any) {
  return {
    ...record,
    totalAmount: Number(record.totalAmount),
    grossSalary: record.grossSalary != null ? Number(record.grossSalary) : null,
    netSalary: record.netSalary != null ? Number(record.netSalary) : null,
    hourlyRate: record.hourlyRate != null ? Number(record.hourlyRate) : null,
    hoursWorked: record.hoursWorked != null ? Number(record.hoursWorked) : null,
    fixedSalary: record.fixedSalary != null ? Number(record.fixedSalary) : null,
    totalDeductions: record.totalDeductions != null ? Number(record.totalDeductions) : null,
    hraAllowance: record.hraAllowance != null ? Number(record.hraAllowance) : null,
    transportAllowance: record.transportAllowance != null ? Number(record.transportAllowance) : null,
    bonus: record.bonus != null ? Number(record.bonus) : null,
    otherAllowances: record.otherAllowances != null ? Number(record.otherAllowances) : null,
    overtimeHours: record.overtimeHours != null ? Number(record.overtimeHours) : null,
    overtimeRate: record.overtimeRate != null ? Number(record.overtimeRate) : null,
    overtimeAmount: record.overtimeAmount != null ? Number(record.overtimeAmount) : null,
    incomeTax: record.incomeTax != null ? Number(record.incomeTax) : null,
    socialSecurity: record.socialSecurity != null ? Number(record.socialSecurity) : null,
    insurance: record.insurance != null ? Number(record.insurance) : null,
    loanRepayment: record.loanRepayment != null ? Number(record.loanRepayment) : null,
    unpaidLeaveDeduction: record.unpaidLeaveDeduction != null ? Number(record.unpaidLeaveDeduction) : null,
    otherDeductions: record.otherDeductions != null ? Number(record.otherDeductions) : null,
  };
}

/**
 * GET /api/payroll
 * Paginated payroll history. Optional ?month=YYYY-MM&year=YYYY filter.
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  const skip = (page - 1) * limit;

  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');

  try {
    const where: any = {};

    if (role === UserRole.CLEANER) {
      where.userId = tokenUser.userId;
    } else {
      const companyId = requireCompanyScope(tokenUser) || tokenUser.companyId;
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
      where.companyId = companyId;
    }

    if (monthParam && yearParam) {
      const [yStr, mStr] = monthParam.includes('-')
        ? monthParam.split('-')
        : [yearParam, monthParam];
      const year = parseInt(yearParam || yStr, 10);
      const month = parseInt(mStr || monthParam, 10);
      if (!Number.isNaN(year) && !Number.isNaN(month)) {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);
        where.periodStart = { gte: start, lte: end };
      }
    }

    const [records, total] = await Promise.all([
      prisma.payrollRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.payrollRecord.count({ where }),
    ]);

    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

    return NextResponse.json({
      success: true,
      data: records.map((r) => ({
        ...serializePayrollRecord(r),
        downloadUrl: apiBase ? `${apiBase}/api/payroll/${r.id}/invoice/download` : undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + records.length < total,
      },
    });
  } catch (error) {
    console.error('Payroll list GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
