import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { requireActiveSubscription } from '@/lib/subscription';
import { UserRole } from '@prisma/client';

type RouteParams = { params: { id: string } };

/** Property-level photo timeline aggregated from task photos */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const subscriptionCheck = await requireActiveSubscription(auth.tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ success: false, message: subscriptionCheck.message }, { status: 403 });
  }

  const propertyId = Number(params.id);
  if (Number.isNaN(propertyId)) {
    return NextResponse.json({ success: false, message: 'Invalid property id' }, { status: 400 });
  }

  const role = auth.tokenUser.role as UserRole;
  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(role !== UserRole.SUPER_ADMIN && role !== UserRole.DEVELOPER && companyId
        ? { companyId }
        : {}),
    },
    select: { id: true, address: true, companyId: true },
  });

  if (!property) {
    return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
  }

  const photoType = request.nextUrl.searchParams.get('photoType');
  const taskLimit = Math.min(Number(request.nextUrl.searchParams.get('taskLimit') || 30), 100);
  const photoLimit = Math.min(Number(request.nextUrl.searchParams.get('photoLimit') || 200), 500);

  const tasks = await prisma.task.findMany({
    where: {
      propertyId: property.id,
      photos: {
        some: photoType ? { photoType } : {},
      },
    },
    orderBy: [{ scheduledDate: 'desc' }, { completedAt: 'desc' }, { createdAt: 'desc' }],
    take: taskLimit,
    select: {
      id: true,
      title: true,
      status: true,
      scheduledDate: true,
      completedAt: true,
      photos: {
        where: photoType ? { photoType } : {},
        orderBy: { takenAt: 'desc' },
        take: photoLimit,
        select: {
          id: true,
          url: true,
          photoType: true,
          caption: true,
          takenAt: true,
          createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const timeline = tasks
    .filter((task) => task.photos.length > 0)
    .map((task) => ({
      taskId: task.id,
      taskTitle: task.title,
      taskStatus: task.status,
      taskDate: (task.completedAt || task.scheduledDate)?.toISOString() ?? null,
      photoCount: task.photos.length,
      photos: task.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        photoType: photo.photoType,
        caption: photo.caption,
        takenAt: photo.takenAt.toISOString(),
        createdAt: photo.createdAt.toISOString(),
        userName: [photo.user.firstName, photo.user.lastName].filter(Boolean).join(' ') || null,
        userId: photo.user.id,
      })),
    }));

  const previewPhotos = timeline
    .flatMap((entry) => entry.photos.map((photo) => ({ ...photo, taskId: entry.taskId, taskTitle: entry.taskTitle })))
    .sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime())
    .slice(0, 12);

  const totalPhotos = timeline.reduce((sum, entry) => sum + entry.photoCount, 0);

  return NextResponse.json({
    success: true,
    data: {
      property,
      timeline,
      previewPhotos,
      totalPhotos,
      taskCount: timeline.length,
    },
  });
}
