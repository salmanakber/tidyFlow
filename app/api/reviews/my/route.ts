import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

/** Client reviews assigned to the logged-in cleaner */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = auth.tokenUser.userId;
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || 30), 100);

  const feedback = await prisma.clientFeedback.findMany({
    where: {
      OR: [
        { cleanerUserId: userId },
        {
          cleanerUserId: null,
          task: {
            OR: [
              { assignedUserId: userId },
              { taskAssignments: { some: { userId } } },
            ],
          },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      task: {
        select: {
          id: true,
          title: true,
          property: { select: { address: true } },
        },
      },
    },
  });

  const avg =
    feedback.length > 0
      ? Math.round((feedback.reduce((s, f) => s + f.rating, 0) / feedback.length) * 10) / 10
      : null;

  return NextResponse.json({
    success: true,
    data: { feedback, averageRating: avg, count: feedback.length },
  });
}
