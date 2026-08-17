import prisma from '@/lib/prisma';
import { getAIConfig, isAIEnabled } from './config';
import { aiVisionAnalysis, parseJSONResponse } from './client';
import { createNotification } from '@/lib/notifications';

interface PhotoAnalysisResult {
  score: number;
  flags: string[];
  summary: string;
}

const ANALYSIS_PROMPT = `You are TidyFlow AI, a cleaning quality verification assistant for professional cleaning companies.
Analyze this cleaning photo and respond ONLY with valid JSON:
{
  "score": <0-100 quality score>,
  "flags": [<array of issue strings, empty if none>],
  "summary": "<one sentence assessment>"
}
Score guidelines:
- 90-100: Excellent cleaning quality, professional appearance
- 70-89: Good quality with minor issues
- 50-69: Acceptable but noticeable issues
- Below 50: Significant quality concerns
Do not block workflows. Flag issues for manager review only.`;

export async function analyzePhoto(
  photoId: number,
  options?: { resetReview?: boolean; locale?: string | null }
): Promise<PhotoAnalysisResult | null> {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      task: { select: { companyId: true, title: true, id: true } },
    },
  });

  if (!photo) return null;

  const config = await getAIConfig(photo.task.companyId);
  if (!isAIEnabled(config) || !config.photoVerification) {
    return null;
  }

  let result: PhotoAnalysisResult;
  let provider = 'groq';
  let modelUsed = config.visionModel;

  try {
    const aiResult = await aiVisionAnalysis(photo.url, ANALYSIS_PROMPT, photo.task.companyId, options?.locale);
    result = parseJSONResponse<PhotoAnalysisResult>(aiResult.text);
    provider = aiResult.provider;
    modelUsed = aiResult.model;
  } catch (error) {
    console.error('AI photo analysis failed, using metadata fallback:', error);
    result = {
      score: 75,
      flags: ['ai_analysis_unavailable'],
      summary: 'Photo uploaded successfully. AI analysis pending manual review.',
    };
  }

  result.score = Math.max(0, Math.min(100, Math.round(result.score)));

  await prisma.aIPhotoScore.upsert({
    where: { photoId },
    create: {
      photoId,
      score: result.score,
      flags: JSON.stringify(result.flags || []),
      summary: result.summary,
      provider,
      model: modelUsed,
    },
    update: {
      score: result.score,
      flags: JSON.stringify(result.flags || []),
      summary: result.summary,
      provider,
      model: modelUsed,
      analyzedAt: new Date(),
      ...(options?.resetReview ? { reviewStatus: 'pending', reviewedAt: null, reviewNote: null } : {}),
    },
  });

  if (result.score < config.minPhotoScore) {
    const managers = await prisma.user.findMany({
      where: {
        companyId: photo.task.companyId,
        role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
        isActive: true,
      },
      select: { id: true },
    });

    for (const manager of managers) {
      await createNotification({
        userId: manager.id,
        title: 'TidyFlow AI: Photo Quality Flag',
        message: `Photo on task "${photo.task.title}" scored ${result.score}/100. ${result.summary}`,
        type: 'high_severity_issue',
        metadata: { taskId: photo.task.id, photoId, aiScore: result.score },
      });
    }
  }

  return result;
}
