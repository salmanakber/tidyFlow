import prisma from '@/lib/prisma';
import { buildTaskProofSummary } from '@/lib/task-proof';
import { resolvePhotoDisplayUrl } from '@/lib/photo-watermark';

export type SharePortalPhoto = {
  id: number;
  url: string;
  photoType: string;
  caption: string | null;
  aiScore: number | null;
  aiSummary: string | null;
  aiFlags: string[];
  analyzedAt: Date | null;
};

export type SharePortalData = {
  title: string;
  description: string | null;
  status: string;
  companyName: string;
  scheduledDate: Date | null;
  completedAt: Date | null;
  assignedUser: { firstName: string | null; lastName: string | null } | null;
  property: {
    address: string;
    postcode: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  photos: SharePortalPhoto[];
  averageScore: number | null;
  checklists: Array<{ title: string; isCompleted: boolean }>;
  notes: Array<{ content: string; category: string | null }>;
  proof: Awaited<ReturnType<typeof buildTaskProofSummary>>;
};

export async function getSharePortalData(
  token: string,
  options?: { incrementView?: boolean }
): Promise<{ ok: true; data: SharePortalData } | { ok: false; status: 404 | 410; message: string }> {
  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          scheduledDate: true,
          completedAt: true,
          assignedUser: {
            select: { firstName: true, lastName: true },
          },
          property: {
            select: {
              address: true,
              postcode: true,
              latitude: true,
              longitude: true,
            },
          },
          company: { select: { name: true, id: true } },
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
    return { ok: false, status: 404, message: 'Link not found' };
  }

  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
    return { ok: false, status: 410, message: 'Link expired' };
  }

  if (options?.incrementView !== false) {
    await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { viewCount: { increment: 1 } },
    });
  }

  const task = shareLink.task;

  const adminConfig = await prisma.adminConfiguration.findUnique({
    where: { companyId: task.company.id },
    select: { watermarkEnabled: true },
  });
  const watermarkSettings = {
    watermarkEnabled: adminConfig?.watermarkEnabled ?? false,
    companyName: task.company.name,
  };

  const photos: SharePortalPhoto[] = task.photos.map((p) => {
    let flags: string[] = [];
    try {
      flags = p.aiPhotoScore?.flags ? JSON.parse(p.aiPhotoScore.flags) : [];
    } catch {
      flags = [];
    }
    return {
      id: p.id,
      url: resolvePhotoDisplayUrl(p.url, watermarkSettings),
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

  const proof = await buildTaskProofSummary(task.id);

  return {
    ok: true,
    data: {
      title: task.title,
      description: task.description,
      status: task.status,
      companyName: task.company.name,
      scheduledDate: task.scheduledDate,
      completedAt: task.completedAt,
      assignedUser: task.assignedUser,
      property: {
        address: task.property.address,
        postcode: task.property.postcode,
        latitude: task.property.latitude != null ? Number(task.property.latitude) : null,
        longitude: task.property.longitude != null ? Number(task.property.longitude) : null,
      },
      photos,
      averageScore,
      checklists: task.checklists,
      notes: task.notes,
      proof,
    },
  };
}
