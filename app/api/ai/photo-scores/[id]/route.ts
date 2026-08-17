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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const role = auth.tokenUser.role as UserRole;
  if (!MANAGER_ROLES.includes(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);

  try {
    const scoreRow = await prisma.aIPhotoScore.findUnique({
      where: { id },
      include: {
        photo: {
          select: {
            task: { select: { id: true, companyId: true, title: true } },
          },
        },
      },
    });

    if (!scoreRow) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    if (companyId && scoreRow.photo.task.companyId !== companyId) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { reviewStatus, reviewNote } = body;

    if (!['approved', 'rejected', 'pending'].includes(reviewStatus)) {
      return NextResponse.json(
        { success: false, message: 'reviewStatus must be approved, rejected, or pending' },
        { status: 400 }
      );
    }

    const updated = await prisma.aIPhotoScore.update({
      where: { id },
      data: {
        reviewStatus,
        reviewNote: reviewNote ?? null,
        reviewedBy: reviewStatus === 'pending' ? null : auth.tokenUser.userId,
        reviewedAt: reviewStatus === 'pending' ? null : new Date(),
      },
      include: {
        photo: { select: { id: true, url: true, photoType: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Photo score review PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Failed to update review' }, { status: 500 });
  }
}
