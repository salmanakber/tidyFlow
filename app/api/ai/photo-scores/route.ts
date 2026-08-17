import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';



export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  const taskId = request.nextUrl.searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  try {
    const task = await prisma.task.findFirst({
      where: {
        id: Number(taskId),
        ...(companyId ? { companyId } : {}),
      },
      select: { id: true, companyId: true },
    });

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const scores = await prisma.aIPhotoScore.findMany({
      where: { photo: { taskId: task.id } },
      orderBy: { analyzedAt: 'desc' },
      include: {
        photo: { select: { id: true, url: true, photoType: true, caption: true } },
      },
    });

    const data = scores.map((row) => {
      let flags: string[] = [];
      try {
        flags = row.flags ? JSON.parse(row.flags) : [];
      } catch {
        flags = [];
      }
      const extended = row as typeof row & {
        reviewStatus?: string;
        reviewedAt?: Date | null;
        reviewNote?: string | null;
      };
      return {
        id: row.id,
        photoId: row.photoId,
        score: row.score,
        summary: row.summary,
        flags,
        provider: row.provider,
        analyzedAt: row.analyzedAt,
        reviewStatus: extended.reviewStatus ?? 'pending',
        reviewedAt: extended.reviewedAt ?? null,
        reviewNote: extended.reviewNote ?? null,
        photo: row.photo,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('AI photo scores GET error:', error);
    return NextResponse.json({ success: false, message: 'Failed to load photo scores' }, { status: 500 });
  }
}
