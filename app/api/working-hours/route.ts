import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/working-hours?startDate=&endDate=
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
  }

  const role = auth.tokenUser.role as UserRole;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);

  try {
    const where: {
      companyId: number;
      userId?: number;
      date?: { gte?: Date; lte?: Date };
    } = { companyId };

    if (role === UserRole.CLEANER) {
      where.userId = auth.tokenUser.userId;
    }

    if (dateFilter.gte || dateFilter.lte) {
      where.date = dateFilter;
    }

    const submissions = await prisma.workingHoursSubmission.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
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
                    durationMinutes: true,
                    user: { select: { id: true, firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const data = submissions.map((s) => ({
      id: s.id,
      userId: s.userId,
      user: s.user,
      date: s.date.toISOString(),
      hours: Number(s.hours),
      description: s.description,
      status: s.status,
      approvedAt: s.approvedAt?.toISOString() ?? null,
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
              status: link.task.status,
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

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[working-hours GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
