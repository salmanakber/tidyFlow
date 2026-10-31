import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import crypto from 'crypto';
import { sendSMS } from '@/lib/sms';
import { buildReviewLink, getTaskCleanerIds } from '@/lib/reviews';

const REVIEW_ELIGIBLE_STATUSES = [
  'SUBMITTED',
  'QA_REVIEW',
  'APPROVED',
  'COMPLETED',
  'ARCHIVED',
] as const;

async function loadTaskForReview(taskId: number, companyId?: number | null) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      ...(companyId ? { companyId } : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      property: {
        select: {
          address: true,
          clientName: true,
          clientEmail: true,
          clientPhone: true,
          client: { select: { name: true, email: true, phone: true } },
        },
      },
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
      taskAssignments: {
        select: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      bookingRequests: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          guestName: true,
          guestEmail: true,
          guestPhone: true,
        },
      },
      reviewRequests: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      clientFeedback: {
        select: {
          id: true,
          rating: true,
          comment: true,
          clientName: true,
          cleanerUserId: true,
          createdAt: true,
          cleaner: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const taskId = Number(request.nextUrl.searchParams.get('taskId'));
  if (!taskId || Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  const task = await loadTaskForReview(taskId, companyId);
  if (!task) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  const active = task.reviewRequests.find(
    (r) => !r.submittedAt && (!r.expiresAt || r.expiresAt > new Date())
  );

  const cleaners = await getTaskCleanerIds(task.id);
  const cleanerUsers =
    cleaners.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: cleaners } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];

  const booking = task.bookingRequests?.[0];
  const clientPhone =
    task.property.clientPhone ||
    task.property.client?.phone ||
    booking?.guestPhone ||
    null;
  const clientEmail =
    task.property.clientEmail ||
    task.property.client?.email ||
    booking?.guestEmail ||
    null;
  const clientName =
    task.property.clientName ||
    task.property.client?.name ||
    booking?.guestName ||
    null;

  return NextResponse.json({
    success: true,
    data: {
      taskId: task.id,
      taskTitle: task.title,
      propertyAddress: task.property.address,
      reviewLink: active ? buildReviewLink(active.token) : null,
      reviewRequest: active,
      submitted: task.reviewRequests.some((r) => r.submittedAt),
      clientPhone,
      clientEmail,
      clientName,
      clientFeedback: task.clientFeedback.map((f) => ({
        id: f.id,
        rating: f.rating,
        comment: f.comment,
        clientName: f.clientName,
        cleanerUserId: f.cleanerUserId,
        createdAt: f.createdAt,
        cleanerName: f.cleaner
          ? [f.cleaner.firstName, f.cleaner.lastName].filter(Boolean).join(' ')
          : null,
      })),
      assignedCleaners: cleanerUsers.map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || `Cleaner #${u.id}`,
      })),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { taskId, redirectUrl, clientPhone, clientEmail } = body;

  if (!taskId) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  const task = await loadTaskForReview(Number(taskId), companyId);
  if (!task) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  if (!REVIEW_ELIGIBLE_STATUSES.includes(task.status as (typeof REVIEW_ELIGIBLE_STATUSES)[number])) {
    return NextResponse.json(
      {
        success: false,
        message: 'Review links are available after the task is submitted',
      },
      { status: 400 }
    );
  }

  const existing = task.reviewRequests.find(
    (r) => !r.submittedAt && (!r.expiresAt || r.expiresAt > new Date())
  );

  const emailOverride =
    typeof clientEmail === 'string' && clientEmail.includes('@')
      ? clientEmail.trim()
      : task.property.clientEmail ||
        task.property.client?.email ||
        task.bookingRequests?.[0]?.guestEmail ||
        null;

  if (existing) {
    const reviewLink = buildReviewLink(existing.token);
    const { ensureAndSendClientFeedbackEmail } = await import('@/lib/review-emails');
    await ensureAndSendClientFeedbackEmail(task.id, { overrideEmail: emailOverride }).catch(() => {});
    const phone =
      (typeof clientPhone === 'string' && clientPhone.trim()) ||
      task.property.clientPhone ||
      task.property.client?.phone ||
      task.bookingRequests?.[0]?.guestPhone ||
      null;
    if (phone) {
      await sendSMS({
        to: phone,
        message: `Thank you for choosing our cleaning service. Please share your feedback: ${reviewLink}`,
      }).catch(() => {});
    }
    return NextResponse.json({
      success: true,
      data: { review: existing, reviewLink, reused: true },
    });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  const review = await prisma.reviewRequest.create({
    data: {
      taskId: task.id,
      token,
      redirectUrl: redirectUrl || null,
      expiresAt,
    },
  });

  const reviewLink = buildReviewLink(token);

  // Prefer email via SystemSetting providers; SMS via Twilio SystemSetting / env
  const { ensureAndSendClientFeedbackEmail } = await import('@/lib/review-emails');
  await ensureAndSendClientFeedbackEmail(task.id, { overrideEmail: emailOverride }).catch(() => {});

  const phone =
    (typeof clientPhone === 'string' && clientPhone.trim()) ||
    task.property.clientPhone ||
    task.property.client?.phone ||
    task.bookingRequests?.[0]?.guestPhone ||
    null;
  if (phone) {
    await sendSMS({
      to: phone,
      message: `Thank you for choosing our cleaning service. Please share your feedback: ${reviewLink}`,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, data: { review, reviewLink, reused: false } }, { status: 201 });
}
