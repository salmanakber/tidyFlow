import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import crypto from 'crypto';
import { buildClientShareLink } from '@/lib/share-links';

const SHAREABLE_STATUSES = ['SUBMITTED', 'QA_REVIEW', 'APPROVED', 'COMPLETED', 'ARCHIVED'];

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const taskId = Number(request.nextUrl.searchParams.get('taskId'));
  if (!taskId || Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...(companyId ? { companyId } : {}) },
    select: {
      id: true,
      title: true,
      status: true,
      property: { select: { address: true } },
      shareLinks: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  if (!task) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  const active = task.shareLinks.find(
    (l) => !l.expiresAt || l.expiresAt > new Date()
  );

  return NextResponse.json({
    success: true,
    data: {
      taskId: task.id,
      taskTitle: task.title,
      propertyAddress: task.property.address,
      canShare: SHAREABLE_STATUSES.includes(task.status),
      shareLink: active ? buildClientShareLink(active.token) : null,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const taskId = Number(body.taskId);
  if (!taskId || Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...(companyId ? { companyId } : {}) },
    select: { id: true, status: true, shareLinks: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });

  if (!task) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  if (!SHAREABLE_STATUSES.includes(task.status)) {
    return NextResponse.json(
      { success: false, message: 'Photo report can be shared after the task is submitted' },
      { status: 400 }
    );
  }

  const existing = task.shareLinks.find(
    (l) => !l.expiresAt || l.expiresAt > new Date()
  );

  if (existing) {
    return NextResponse.json({
      success: true,
      data: { shareLink: buildClientShareLink(existing.token), reused: true },
    });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const link = await prisma.shareLink.create({
    data: { taskId: task.id, token, expiresAt },
  });

  return NextResponse.json(
    {
      success: true,
      data: { shareLink: buildClientShareLink(link.token), reused: false },
    },
    { status: 201 }
  );
}
