import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/** List hours edit requests (managers: company queue; cleaners: own requests). */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const role = auth.tokenUser.role as UserRole;
  const status = request.nextUrl.searchParams.get('status') || 'pending';
  const isManager = isManagerPlusRole(role);

  const requests = await prisma.hoursEditRequest.findMany({
    where: {
      companyId,
      ...(status !== 'all' ? { status } : {}),
      ...(!isManager ? { requesterId: auth.tokenUser.userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      requester: { select: { id: true, firstName: true, lastName: true } },
      assignment: {
        select: {
          id: true,
          durationMinutes: true,
          editedDurationMinutes: true,
          startWithinGeofence: true,
          endWithinGeofence: true,
          task: {
            select: {
              id: true,
              title: true,
              property: { select: { address: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: requests.map((r) => ({
      id: r.id,
      status: r.status,
      proposedDurationMinutes: r.proposedDurationMinutes,
      currentDurationMinutes: r.currentDurationMinutes,
      reason: r.reason,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt,
      requester: r.requester,
      assignmentId: r.assignmentId,
      taskId: r.assignment.task.id,
      taskTitle: r.assignment.task.title,
      propertyAddress: r.assignment.task.property?.address,
      startWithinGeofence: r.assignment.startWithinGeofence,
      endWithinGeofence: r.assignment.endWithinGeofence,
      geoFlagged:
        r.assignment.startWithinGeofence === false || r.assignment.endWithinGeofence === false,
    })),
  });
}

/** Cleaner (or manager) submits a duration correction request. */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const body = await request.json();
  const assignmentId = Number(body.assignmentId);
  const proposedDurationMinutes = Number(body.proposedDurationMinutes);
  const reason = body.reason ? String(body.reason).trim() : null;

  if (!assignmentId || !Number.isFinite(proposedDurationMinutes) || proposedDurationMinutes < 1) {
    return NextResponse.json(
      { success: false, message: 'assignmentId and proposedDurationMinutes required' },
      { status: 400 }
    );
  }

  const assignment = await prisma.taskAssignment.findFirst({
    where: {
      id: assignmentId,
      task: { companyId },
    },
    select: {
      id: true,
      userId: true,
      durationMinutes: true,
      editedDurationMinutes: true,
      endedAt: true,
    },
  });

  if (!assignment) {
    return NextResponse.json({ success: false, message: 'Assignment not found' }, { status: 404 });
  }

  const role = auth.tokenUser.role as UserRole;
  const isManager = isManagerPlusRole(role);
  if (!isManager && assignment.userId !== auth.tokenUser.userId) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  if (!assignment.endedAt) {
    return NextResponse.json(
      { success: false, message: 'Finish the job before requesting a hours correction' },
      { status: 400 }
    );
  }

  const pending = await prisma.hoursEditRequest.findFirst({
    where: { assignmentId, status: 'pending' },
  });
  if (pending) {
    return NextResponse.json(
      { success: false, message: 'A pending correction request already exists for this job' },
      { status: 409 }
    );
  }

  const current =
    assignment.editedDurationMinutes ?? assignment.durationMinutes ?? Math.round(proposedDurationMinutes);

  const created = await prisma.hoursEditRequest.create({
    data: {
      companyId,
      assignmentId,
      requesterId: auth.tokenUser.userId,
      proposedDurationMinutes: Math.round(proposedDurationMinutes),
      currentDurationMinutes: current,
      reason,
      status: 'pending',
    },
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
