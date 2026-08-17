import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { serializeLineItem } from '@/lib/payroll-rules';

/**
 * GET /api/payroll/[id]
 * Consolidated payroll record with period shift breakdown.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const payrollId = Number(id);
    if (Number.isNaN(payrollId)) {
      return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
    }

    const { tokenUser } = auth;
    const record = await prisma.payrollRecord.findUnique({
      where: { id: payrollId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            payrollWorkerType: true,
            bankAccountNumber: true,
            bankSortCode: true,
            bankName: true,
          },
        },
        company: { select: { name: true } },
        lineItems: { orderBy: { id: 'asc' } },
      },
    });

    if (!record) {
      return NextResponse.json({ success: false, message: 'Payroll record not found' }, { status: 404 });
    }

    const isOwn = record.userId === tokenUser.userId;
    const isCompany =
      record.companyId === tokenUser.companyId ||
      ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(tokenUser.role);

    if (!isOwn && !isCompany) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const shifts = await prisma.workingHoursSubmission.findMany({
      where: {
        userId: record.userId,
        date: { gte: record.periodStart, lte: record.periodEnd },
        status: { in: ['approved', 'paid', 'locked'] },
      },
      include: {
        tasks: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                property: { select: { address: true, postcode: true } },
                taskAssignments: {
                  select: {
                    userId: true,
                    user: { select: { id: true, firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    const payrollUserId = record.userId;

    const shiftBreakdown = shifts.map((s) => ({
      id: s.id,
      date: s.date,
      hours: Number(s.hours),
      status: s.status,
      lockedAt: s.lockedAt,
      tasks: s.tasks.map((t) => {
        const assignments = t.task?.taskAssignments ?? [];
        const otherCleaners = assignments
          .filter((a) => a.userId !== payrollUserId)
          .map((a) => ({
            id: a.userId,
            name: `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim() || 'Cleaner',
          }));
        return {
          taskId: t.taskId,
          hours: t.hours != null ? Number(t.hours) : null,
          title: t.task?.title ?? null,
          address: t.task?.property?.address ?? null,
          postcode: t.task?.property?.postcode ?? null,
          otherCleaners,
          totalCleanersOnTask: assignments.length,
        };
      }),
    }));

    return NextResponse.json({
      success: true,
      data: {
        ...record,
        totalAmount: Number(record.totalAmount),
        grossSalary: record.grossSalary != null ? Number(record.grossSalary) : null,
        netSalary: record.netSalary != null ? Number(record.netSalary) : null,
        hourlyRate: record.hourlyRate != null ? Number(record.hourlyRate) : null,
        hoursWorked: record.hoursWorked != null ? Number(record.hoursWorked) : null,
        shiftBreakdown,
        lineItems: record.lineItems.map(serializeLineItem),
        consolidatedPeriod: true,
      },
    });
  } catch (error) {
    console.error('Payroll detail GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
