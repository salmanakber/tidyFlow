import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

const MANAGER_ROLES: UserRole[] = [
  UserRole.MANAGER,
  UserRole.COMPANY_ADMIN,
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
  UserRole.DEVELOPER,
];

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const role = auth.tokenUser.role as UserRole;
  if (!MANAGER_ROLES.includes(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const taskId = Number(body.taskId);
  const reviewStatus = String(body.reviewStatus || 'approved');

  if (!taskId || Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  if (!['approved', 'rejected', 'pending'].includes(reviewStatus)) {
    return NextResponse.json(
      { success: false, message: 'reviewStatus must be approved, rejected, or pending' },
      { status: 400 }
    );
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);

  const task = await prisma.task.findFirst({
    where: { id: taskId, ...(companyId ? { companyId } : {}) },
    select: { id: true },
  });

  if (!task) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  const result = await prisma.aIPhotoScore.updateMany({
    where: {
      photo: { taskId: task.id },
      score: { gt: 0 },
    },
    data: {
      reviewStatus,
      reviewedBy: reviewStatus === 'pending' ? null : auth.tokenUser.userId,
      reviewedAt: reviewStatus === 'pending' ? null : new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    data: { updated: result.count, reviewStatus },
    message: `${result.count} photo(s) marked as ${reviewStatus}`,
  });
}
