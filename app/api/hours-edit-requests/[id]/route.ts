import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/** Approve or reject a hours correction request. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const { id } = await params;
  const requestId = Number(id);
  const body = await request.json();
  const action = String(body.action || '').toLowerCase(); // approve | reject
  const reviewNote = body.reviewNote ? String(body.reviewNote).trim() : null;

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ success: false, message: 'action must be approve or reject' }, { status: 400 });
  }

  const existing = await prisma.hoursEditRequest.findFirst({
    where: { id: requestId, companyId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ success: false, message: 'Request already reviewed' }, { status: 400 });
  }

  if (action === 'approve') {
    await prisma.$transaction([
      prisma.taskAssignment.update({
        where: { id: existing.assignmentId },
        data: {
          editedDurationMinutes: existing.proposedDurationMinutes,
          editedBy: auth.tokenUser.userId,
          editedAt: new Date(),
        },
      }),
      prisma.hoursEditRequest.update({
        where: { id: existing.id },
        data: {
          status: 'approved',
          reviewedById: auth.tokenUser.userId,
          reviewedAt: new Date(),
          reviewNote,
        },
      }),
    ]);
  } else {
    await prisma.hoursEditRequest.update({
      where: { id: existing.id },
      data: {
        status: 'rejected',
        reviewedById: auth.tokenUser.userId,
        reviewedAt: new Date(),
        reviewNote,
      },
    });
  }

  const updated = await prisma.hoursEditRequest.findUnique({ where: { id: existing.id } });
  return NextResponse.json({ success: true, data: updated });
}
