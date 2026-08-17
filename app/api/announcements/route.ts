import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveAuthenticatedUser, resolveCompanyIdAsync } from '@/lib/rbac';
import { createNotification } from '@/lib/notifications';
import { Prisma, UserRole } from '@prisma/client';

/** Only owners (and platform roles) manage announcements — not managers/cleaners. */
const CREATOR_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.DEVELOPER,
  UserRole.SUPER_ADMIN,
];

const ALLOWED_TARGETS = new Set(['CLEANER', 'MANAGER', 'COMPANY_ADMIN', 'OWNER']);

function canCreate(role: UserRole) {
  return CREATOR_ROLES.includes(role);
}

const SESSION_STALE = {
  success: false,
  message: 'Your session is out of date. Please sign out and sign in again.',
};

/** Parse YYYY-MM-DD or ISO into end-of-day UTC so the banner shows through that calendar date. */
function parseExpiresAt(input: unknown): Date | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T23:59:59.999Z`);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function notExpiredFilter(now = new Date()): Prisma.AnnouncementWhereInput {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
  };
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const actor = await resolveAuthenticatedUser(auth.tokenUser);
    if (!actor) {
      return NextResponse.json(SESSION_STALE, { status: 401 });
    }

    const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const role = actor.role as UserRole;
    const activeOnly =
      request.nextUrl.searchParams.get('activeOnly') === '1' ||
      request.nextUrl.searchParams.get('activeOnly') === 'true';

    const where: Prisma.AnnouncementWhereInput = canCreate(role)
      ? {
          companyId,
          ...(activeOnly ? notExpiredFilter() : {}),
        }
      : {
          companyId,
          AND: [
            { OR: [{ targetRole: null }, { targetRole: role }] },
            notExpiredFilter(),
          ],
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

  try {
    const actor = await resolveAuthenticatedUser(auth.tokenUser);
    if (!actor) {
      return NextResponse.json(SESSION_STALE, { status: 401 });
    }

    const role = actor.role as UserRole;
    if (!canCreate(role)) {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const targetRole: string | null =
      typeof body.targetRole === 'string' && body.targetRole.trim()
        ? body.targetRole.trim().toUpperCase()
        : null;
    const expiresAt = parseExpiresAt(body.expiresAt ?? body.expiresOn);

    if (!title || !message) {
      return NextResponse.json(
        { success: false, message: 'Title and message are required' },
        { status: 400 }
      );
    }

    if (!expiresAt) {
      return NextResponse.json(
        { success: false, message: 'Expiration date is required' },
        { status: 400 }
      );
    }

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    if (expiresAt < startOfToday) {
      return NextResponse.json(
        { success: false, message: 'Expiration date must be today or later' },
        { status: 400 }
      );
    }

    if (targetRole && !ALLOWED_TARGETS.has(targetRole)) {
      return NextResponse.json({ success: false, message: 'Invalid target role' }, { status: 400 });
    }

    const companyId =
      (await resolveCompanyIdAsync(request, auth.tokenUser)) ?? actor.companyId ?? null;
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const announcement = await prisma.announcement.create({
      data: {
        companyId,
        title,
        message,
        targetRole,
        expiresAt,
        createdBy: actor.id,
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    const recipients = await prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        id: { not: actor.id },
        ...(targetRole ? { role: targetRole as UserRole } : {}),
      },
      select: { id: true, role: true },
    });

    await Promise.all(
      recipients.map((user) => {
        const homeRoute =
          user.role === UserRole.CLEANER
            ? 'CleanerHome'
            : user.role === UserRole.MANAGER
              ? 'ManagerHome'
              : undefined;
        return createNotification({
          userId: user.id,
          title,
          message,
          type: 'announcement',
          metadata: {
            announcementId: announcement.id,
            expiresAt: expiresAt.toISOString(),
            ...(homeRoute ? { screenRoute: homeRoute } : {}),
          },
          screenRoute: homeRoute,
        });
      })
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

  try {
    const actor = await resolveAuthenticatedUser(auth.tokenUser);
    if (!actor) {
      return NextResponse.json(SESSION_STALE, { status: 401 });
    }

    const role = actor.role as UserRole;
    if (!canCreate(role)) {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }

    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: 'id required' }, { status: 400 });
    }

    const companyId =
      (await resolveCompanyIdAsync(request, auth.tokenUser)) ?? actor.companyId ?? null;
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
