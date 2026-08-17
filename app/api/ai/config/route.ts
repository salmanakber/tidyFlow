import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import {
  getAIConfig,
  getGlobalAIConfigurationRow,
  upsertAIConfig,
  getAIProviderStatus,
} from '@/lib/ai';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);

  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const [dbRow, config] = await Promise.all([getGlobalAIConfigurationRow(), getAIConfig()]);
  const providers = getAIProviderStatus(config);

  return NextResponse.json({
    success: true,
    data: {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      visionModel: config.visionModel,
      photoVerification: config.photoVerification,
      assignmentRecommend: config.assignmentRecommend,
      insightsEnabled: config.insightsEnabled,
      minPhotoScore: config.minPhotoScore,
      googleModel: config.googleModel,
      googleVisionModel: config.googleVisionModel,
      hasGroqKey: !!config.apiKey,
      hasGoogleKey: !!config.googleApiKey,
      hasStoredGroqKey: !!dbRow?.groqApiKey?.trim(),
      hasStoredGoogleKey: !!dbRow?.googleApiKey?.trim(),
      groqKeySource: config.groqKeySource,
      googleKeySource: config.googleKeySource,
      providerLabel: 'TidyFlow AI (Groq + Google Gemini fallback)',
      providers,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      enabled,
      model,
      visionModel,
      photoVerification,
      assignmentRecommend,
      insightsEnabled,
      minPhotoScore,
      googleModel,
      googleVisionModel,
      groqApiKey,
      googleApiKey,
      clearGroqApiKey,
      clearGoogleApiKey,
    } = body;

    const updated = await upsertAIConfig({
      ...(enabled !== undefined && { enabled }),
      ...(model && { model }),
      ...(visionModel && { visionModel }),
      ...(photoVerification !== undefined && { photoVerification }),
      ...(assignmentRecommend !== undefined && { assignmentRecommend }),
      ...(insightsEnabled !== undefined && { insightsEnabled }),
      ...(minPhotoScore !== undefined && { minPhotoScore }),
      ...(googleModel !== undefined && { googleModel }),
      ...(googleVisionModel !== undefined && { googleVisionModel }),
      ...(groqApiKey !== undefined && { groqApiKey }),
      ...(googleApiKey !== undefined && { googleApiKey }),
      ...(clearGroqApiKey && { groqApiKey: '' }),
      ...(clearGoogleApiKey && { googleApiKey: '' }),
    });

    const config = await getAIConfig();

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        hasGroqKey: !!config.apiKey,
        hasGoogleKey: !!config.googleApiKey,
        groqKeySource: config.groqKeySource,
        googleKeySource: config.googleKeySource,
      },
    });
  } catch (error) {
    console.error('AI config PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Failed to update config' }, { status: 500 });
  }
}
