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
      openaiModel: config.openaiModel,
      openaiVisionModel: config.openaiVisionModel,
      providerPriority: config.providerPriority,
      hasGroqKey: !!config.apiKey,
      hasGoogleKey: !!config.googleApiKey,
      hasOpenaiKey: !!config.openaiApiKey,
      hasStoredGroqKey: !!dbRow?.groqApiKey?.trim(),
      hasStoredGoogleKey: !!dbRow?.googleApiKey?.trim(),
      hasStoredOpenaiKey: !!dbRow?.openaiApiKey?.trim(),
      groqKeySource: config.groqKeySource,
      googleKeySource: config.googleKeySource,
      openaiKeySource: config.openaiKeySource,
      providerLabel: 'TidyFlow AI (OpenAI / Groq / Google Gemini — configurable priority)',
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
      openaiModel,
      openaiVisionModel,
      providerPriority,
      groqApiKey,
      googleApiKey,
      openaiApiKey,
      clearGroqApiKey,
      clearGoogleApiKey,
      clearOpenaiApiKey,
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
      ...(openaiModel !== undefined && { openaiModel }),
      ...(openaiVisionModel !== undefined && { openaiVisionModel }),
      ...(providerPriority !== undefined && { providerPriority }),
      ...(groqApiKey !== undefined && { groqApiKey }),
      ...(googleApiKey !== undefined && { googleApiKey }),
      ...(openaiApiKey !== undefined && { openaiApiKey }),
      ...(clearGroqApiKey && { groqApiKey: '' }),
      ...(clearGoogleApiKey && { googleApiKey: '' }),
      ...(clearOpenaiApiKey && { clearOpenaiApiKey: true }),
    });

    const config = await getAIConfig();

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        hasGroqKey: !!config.apiKey,
        hasGoogleKey: !!config.googleApiKey,
        hasOpenaiKey: !!config.openaiApiKey,
        groqKeySource: config.groqKeySource,
        googleKeySource: config.googleKeySource,
        openaiKeySource: config.openaiKeySource,
        providerPriority: config.providerPriority,
      },
    });
  } catch (error) {
    console.error('AI config PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Failed to update config' }, { status: 500 });
  }
}
