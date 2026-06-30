import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { findActiveRulesForPeriod, serializeRule } from '@/lib/payroll-rules';

/**
 * GET /api/payroll/period-preview?periodStart=&periodEnd=
 * Staff and hours for a pay period — includes task-assigned cleaners and hour submissions.
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodStartRaw = searchParams.get('periodStart');
  const periodEndRaw = searchParams.get('periodEnd');

  if (!periodStartRaw || !periodEndRaw) {
    return NextResponse.json(
      { success: false, message: 'periodStart and periodEnd are required' },
      { status: 400 },
    );
  }

  const periodStart = new Date(periodStartRaw);
  const periodEnd = new Date(periodEndRaw);
  periodEnd.setHours(23, 59, 59, 999);

  try {
    const [submissions, tasksInPeriod] = await Promise.all([
      prisma.workingHoursSubmission.findMany({
        where: {
          companyId,
          date: { gte: periodStart, lte: periodEnd },
          status: { in: ['pending', 'approved'] },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              defaultHourlyRate: true,
              basicSalary: true,
              salaryType: true,
              payrollWorkerType: true,
            },
          },
          tasks: {
            include: {
              task: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  property: { select: { address: true } },
                  taskAssignments: {
                    select: {
                      userId: true,
                      workSessions: true,
                      user: { select: { id: true, firstName: true, lastName: true, email: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      }),
      prisma.task.findMany({
        where: {
          companyId,
          scheduledDate: { gte: periodStart, lte: periodEnd },
        },
        select: {
          id: true,
          title: true,
          assignedUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              defaultHourlyRate: true,
              basicSalary: true,
              salaryType: true,
              payrollWorkerType: true,
            },
          },
          taskAssignments: {
            select: {
              userId: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  defaultHourlyRate: true,
                  basicSalary: true,
                  salaryType: true,
                  payrollWorkerType: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const staffMap = new Map<number, any>();

    const addStaff = async (user: any, source: 'hours' | 'task') => {
      if (!user?.id) return;
      const existing = staffMap.get(user.id);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
        return;
      }
      const activeRules = await findActiveRulesForPeriod(user.id, companyId, periodStart, periodEnd);
      staffMap.set(user.id, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        defaultHourlyRate: user.defaultHourlyRate != null ? Number(user.defaultHourlyRate) : null,
        basicSalary: user.basicSalary != null ? Number(user.basicSalary) : null,
        salaryType: user.salaryType,
        payrollWorkerType: user.payrollWorkerType,
        activeRules: activeRules.map(serializeRule),
        sources: [source],
      });
    };

    for (const s of submissions) {
      await addStaff(s.user, 'hours');
      for (const link of s.tasks) {
        for (const ta of link.task?.taskAssignments || []) {
          await addStaff(ta.user, 'task');
        }
      }
    }

    for (const task of tasksInPeriod) {
      if (task.assignedUser) await addStaff(task.assignedUser, 'task');
      for (const ta of task.taskAssignments) {
        await addStaff(ta.user, 'task');
      }
    }

    const hours = submissions.map((s) => ({
      id: s.id,
      userId: s.userId,
      user: s.user,
      date: s.date.toISOString(),
      hours: Number(s.hours),
      status: s.status,
      tasks: s.tasks.map((link) => {
        const assignment = link.task?.taskAssignments?.find((ta) => ta.userId === s.userId);
        const workSessions = assignment?.workSessions ?? null;
        const sessionCount = Array.isArray(workSessions) ? workSessions.length : 0;
        return {
          taskId: link.taskId,
          hours: link.hours != null ? Number(link.hours) : null,
          workSessions,
          sessionCount,
          task: link.task
            ? {
                id: link.task.id,
                title: link.task.title,
                address: link.task.property?.address ?? null,
                assignedCleaners: link.task.taskAssignments.map((ta) => ({
                  id: ta.userId,
                  name: `${ta.user.firstName || ''} ${ta.user.lastName || ''}`.trim(),
                })),
              }
            : null,
        };
      }),
    }));

    const pendingCount = hours.filter((h) => h.status === 'pending').length;
    const approvedCount = hours.filter((h) => h.status === 'approved').length;

    return NextResponse.json({
      success: true,
      data: {
        staff: Array.from(staffMap.values()),
        staffIds: Array.from(staffMap.keys()),
        hours,
        pendingCount,
        approvedCount,
        taskCount: tasksInPeriod.length,
      },
    });
  } catch (error) {
    console.error('Payroll period-preview error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
