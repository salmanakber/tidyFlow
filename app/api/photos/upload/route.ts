import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveAuthenticatedUser } from '@/lib/rbac';
import { uploadPhotoToCloudinary } from '@/lib/cloudinary';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const actor = await resolveAuthenticatedUser(tokenUser);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          message: 'Your session is out of date. Please sign out and sign in again.',
        },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const taskId = Number(formData.get('taskId'));
    const photoType = formData.get('photoType') as 'before' | 'after';
    const caption = formData.get('caption') as string | null;
    const file = formData.get('file') as File;

    if (!taskId || !photoType || !file) {
      return NextResponse.json(
        { success: false, message: 'taskId, photoType, and file are required' },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, companyId: true, assignedUserId: true, company: { select: { name: true } } },
    });

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const adminConfig = await prisma.adminConfiguration.findUnique({
      where: { companyId: task.companyId },
      select: { photoCountRequirement: true, watermarkEnabled: true },
    });
    const maxPerType = adminConfig?.photoCountRequirement ?? 20;

    const existingCount = await prisma.photo.count({
      where: { taskId, photoType },
    });

    if (existingCount >= maxPerType) {
      return NextResponse.json(
        {
          success: false,
          message: `Maximum ${maxPerType} ${photoType} photos allowed for this task`,
          maxPerType,
          currentCount: existingCount,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = new Date();
    
    // Extract EXIF timestamp if available
    let exifTimestamp: Date | null = null;
    try {
      // In production, use a library like 'exifr' or 'piexifjs' to extract EXIF data
      // For now, we'll attempt basic extraction
      const { extractExifTimestamp } = await import("@/lib/exif");
      exifTimestamp = await extractExifTimestamp(buffer);
    } catch (error) {
      console.warn("Could not extract EXIF timestamp:", error);
      // Fall back to current timestamp
    }

    const watermarkText =
      adminConfig?.watermarkEnabled && task.company?.name ? task.company.name : null;

    const uploadResult = await uploadPhotoToCloudinary(
      buffer,
      taskId,
      actor.id,
      photoType,
      timestamp,
      { watermarkText }
    );

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { success: false, message: uploadResult.error || 'Upload failed' },
        { status: 500 }
      );
    }

    const photo = await prisma.photo.create({
      data: {
        taskId,
        userId: actor.id,
        url: uploadResult.url,
        caption,
        photoType,
        takenAt: exifTimestamp || timestamp,
        exifTimestamp: exifTimestamp,
      },
    });

    // TidyFlow AI: async photo verification (non-blocking) when quota allows
    import('@/lib/subscription')
      .then(async ({ checkPlanLimit, logAIUsage }) => {
        const limit = await checkPlanLimit(task.companyId, 'photo_verification');
        if (!limit.allowed) return;
        const { analyzePhoto } = await import('@/lib/ai/photo-verification');
        const result = await analyzePhoto(photo.id);
        if (result && !result.flags?.includes('ai_analysis_unavailable')) {
          await logAIUsage(task.companyId, 'photo_verification');
        }
      })
      .catch((err) => console.error('Background AI photo analysis failed:', err));

    const { emitTaskEvent } = await import('@/lib/realtime');
    await emitTaskEvent('task:photo', task.companyId, taskId, {
      photoId: photo.id,
      url: photo.url,
      photoType: photo.photoType,
    });

    return NextResponse.json({ success: true, data: { photo } }, { status: 201 });
  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
