import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

/**
 * Authenticated in-app account deletion request (Guideline 5.1.1(v)).
 * Schedules deletion in 15 days — same policy as the public OTP web flow.
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = Number(auth.tokenUser.userId);
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const requestedAt = new Date();
    const scheduledDeletionAt = new Date(requestedAt.getTime() + 15 * 24 * 60 * 60 * 1000);
    const trimmedEmail = user.email.toLowerCase().trim();

    const existing = await prisma.accountDeletionRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
    });

    let deletionRequest;
    if (existing) {
      deletionRequest = await prisma.accountDeletionRequest.update({
        where: { id: existing.id },
        data: {
          email: trimmedEmail,
          requestedAt,
          scheduledDeletionAt,
        },
      });
    } else {
      deletionRequest = await prisma.accountDeletionRequest.create({
        data: {
          userId: user.id,
          email: trimmedEmail,
          requestedAt,
          scheduledDeletionAt,
          status: 'pending',
        },
      });
    }

    return NextResponse.json({
      success: true,
      message:
        'Your account deletion request has been received. Your account is scheduled for deletion in 15 days. Contact support to cancel before then.',
      data: {
        scheduledDeletionAt: deletionRequest.scheduledDeletionAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Authenticated account deletion error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
