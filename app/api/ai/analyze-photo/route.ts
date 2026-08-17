import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { analyzePhoto } from '@/lib/ai';
import { requireAIFeature, logAIUsage } from '@/lib/subscription';
import prisma from '@/lib/prisma';
import { getRequestLocale } from '@/lib/locale';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { photoId, force } = body;

    if (!photoId) {
      return NextResponse.json({ success: false, message: 'photoId required' }, { status: 400 });
    }

    const photo = await prisma.photo.findUnique({
      where: { id: Number(photoId) },
      include: { task: { select: { companyId: true } } },
    });

    if (!photo) {
      return NextResponse.json({ success: false, message: 'Photo not found' }, { status: 404 });
    }

    const companyId = photo.task.companyId;
    const gate = await requireAIFeature(companyId, 'photo');
    if (!gate.allowed) {
      return NextResponse.json({ success: false, message: gate.message }, { status: 403 });
    }

    if (!force) {
      const existing = await prisma.aIPhotoScore.findUnique({
        where: { photoId: photo.id },
      });
      if (existing && existing.score > 0) {
        let flags: string[] = [];
        try {
          flags = existing.flags ? JSON.parse(existing.flags) : [];
        } catch {
          flags = [];
        }
        return NextResponse.json({
          success: true,
          data: {
            score: existing.score,
            summary: existing.summary,
            flags,
            cached: true,
          },
        });
      }
    }

    const limitCheck = await import('@/lib/subscription').then((m) =>
      m.checkPlanLimit(companyId, 'photo_verification')
    );
    if (!limitCheck.allowed) {
      return NextResponse.json({ success: false, message: limitCheck.message }, { status: 403 });
    }

    const result = await analyzePhoto(Number(photoId), {
      resetReview: !!force,
      locale: getRequestLocale(request, body),
    });

    if (!result) {
      return NextResponse.json(
        { success: false, message: 'Photo not found or AI disabled' },
        { status: 404 }
      );
    }

    // Each successful analysis consumes one photo verification quota
    if (!result.flags?.includes('ai_analysis_unavailable')) {
      await logAIUsage(companyId, 'photo_verification');
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Analyze photo error:', error);
    return NextResponse.json({ success: false, message: 'Analysis failed' }, { status: 500 });
  }
}
