import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { createNotification } from '@/lib/notifications';
import { UserRole } from '@prisma/client';

const CREATOR_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.DEVELOPER,
  UserRole.MANAGER,
  UserRole.COMPANY_ADMIN,
  UserRole.SUPER_ADMIN,
];

const ALLOWED_TARGETS = new Set(['CLEANER', 'MANAGER', 'COMPANY_ADMIN', 'OWNER']);

function canCreate(role: UserRole) {
  return CREATOR_ROLES.includes(role);
}

function canManage(role: UserRole) {
  return CREATOR_ROLES.includes(role);
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const companyId = tokenUser.companyId;
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    // Creators see everything they post (including role-targeted); others see all + matching role
    const where = canManage(role)
      ? { companyId }
      : {
          companyId,
          OR: [{ targetRole: null }, { targetRole: role }],
        };

    const announcements = await prisma.announcement.findMany({
      where,
      include: {
        creator: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, data: announcements });
  } catch (error) {
    console.error('Announcements GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (!canCreate(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    let targetRole: string | null =
      typeof body.targetRole === 'string' && body.targetRole.trim()
        ? body.targetRole.trim().toUpperCase()
        : null;

    if (!title || !message) {
      return NextResponse.json(
        { success: false, message: 'Title and message are required' },
        { status: 400 }
      );
    }

    if (targetRole && !ALLOWED_TARGETS.has(targetRole)) {
      return NextResponse.json({ success: false, message: 'Invalid target role' }, { status: 400 });
    }

    const companyId = tokenUser.companyId;
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const announcement = await prisma.announcement.create({
      data: {
        companyId,
        title,
        message,
        targetRole,
        createdBy: tokenUser.userId,
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    const recipients = await prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        id: { not: tokenUser.userId },
        ...(targetRole ? { role: targetRole as UserRole } : {}),
      },
      select: { id: true },
    });

    await Promise.all(
      recipients.map((user) =>
        createNotification({
          userId: user.id,
          title,
          message,
          type: 'announcement',
          metadata: { announcementId: announcement.id, screenRoute: 'Announcements' },
          screenRoute: 'Announcements',
        })
      )
    );

    return NextResponse.json({ success: true, data: announcement }, { status: 201 });
  } catch (error) {
    console.error('Announcements POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (!canManage(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: 'id required' }, { status: 400 });
    }

    const companyId = tokenUser.companyId;
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const existing = await prisma.announcement.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    await prisma.announcement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Announcements DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
