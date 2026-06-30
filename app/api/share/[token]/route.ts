import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const shareLink = await prisma.shareLink.findUnique({
    where: { token: params.token },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          scheduledDate: true,
          completedAt: true,
          property: { select: { address: true, postcode: true } },
          company: { select: { name: true } },
          photos: {
            orderBy: { takenAt: 'asc' },
            select: {
              id: true,
              url: true,
              photoType: true,
              caption: true,
              aiPhotoScore: {
                select: {
                  score: true,
                  summary: true,
                  flags: true,
                  analyzedAt: true,
                },
              },
            },
          },
          checklists: { select: { title: true, isCompleted: true } },
          notes: {
            where: { noteType: 'issue' },
            select: { content: true, category: true },
            take: 10,
          },
        },
      },
    },
  });

  if (!shareLink) {
    return NextResponse.json({ success: false, message: 'Link not found' }, { status: 404 });
  }

  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
    return NextResponse.json({ success: false, message: 'Link expired' }, { status: 410 });
  }

  await prisma.shareLink.update({
    where: { id: shareLink.id },
    data: { viewCount: { increment: 1 } },
  });

  const task = shareLink.task;
  const photos = task.photos.map((p) => {
    let flags: string[] = [];
    try {
      flags = p.aiPhotoScore?.flags ? JSON.parse(p.aiPhotoScore.flags) : [];
    } catch {
      flags = [];
    }
    return {
      id: p.id,
      url: p.url,
      photoType: p.photoType,
      caption: p.caption,
      aiScore: p.aiPhotoScore?.score ?? null,
      aiSummary: p.aiPhotoScore?.summary ?? null,
      aiFlags: flags,
      analyzedAt: p.aiPhotoScore?.analyzedAt ?? null,
    };
  });

  const scored = photos.filter((p) => p.aiScore != null);
  const averageScore =
    scored.length > 0
      ? Math.round(scored.reduce((s, p) => s + (p.aiScore || 0), 0) / scored.length)
      : null;

  return NextResponse.json({
    success: true,
    data: {
      title: task.title,
      description: task.description,
      status: task.status,
      companyName: task.company.name,
      scheduledDate: task.scheduledDate,
      completedAt: task.completedAt,
      property: task.property,
      photos,
      averageScore,
      checklists: task.checklists,
      notes: task.notes,
    },
  });
}
