import prisma from '@/lib/prisma';
import { decryptStoredSecret, encryptSecret } from '@/lib/encrypt';

export interface AIConfig {
  enabled: boolean;
  provider: string;
  model: string;
  visionModel: string;
  photoVerification: boolean;
  assignmentRecommend: boolean;
  insightsEnabled: boolean;
  minPhotoScore: number;
  apiKey: string | null;
  googleApiKey: string | null;
  googleModel: string;
  googleVisionModel: string;
  groqKeySource: 'database' | 'environment' | null;
  googleKeySource: 'database' | 'environment' | null;
}

type AIConfigurationRow = {
  enabled: boolean;
  provider: string;
  model: string;
  visionModel: string;
  photoVerification: boolean;
  assignmentRecommend: boolean;
  insightsEnabled: boolean;
  minPhotoScore: number;
  groqApiKey?: string | null;
  googleApiKey?: string | null;
  googleModel?: string | null;
  googleVisionModel?: string | null;
};

const ENV_GROQ_KEY = (): string | null => {
  const key = process.env.GROQ_API_KEY?.trim();
  return key || null;
};
const ENV_GOOGLE_KEY = (): string | null => {
  const key = process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  return key || null;
};

const DEFAULT_CONFIG = {
  enabled: true,
  provider: 'groq',
  model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  visionModel: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
  googleModel: process.env.GOOGLE_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  googleVisionModel:
    process.env.GOOGLE_AI_VISION_MODEL ||
    process.env.GEMINI_VISION_MODEL ||
    'gemini-2.0-flash',
  photoVerification: true,
  assignmentRecommend: true,
  insightsEnabled: true,
  minPhotoScore: 60,
};

/** Groq vision models that no longer work — auto-replaced at runtime and persisted to DB. */
const DECOMMISSIONED_GROQ_VISION_MODELS = new Set([
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
  'llava-1.5-7b-4096-preview',
]);

export const CURRENT_GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export function resolveGroqVisionModel(model: string | null | undefined): string {
  if (!model || DECOMMISSIONED_GROQ_VISION_MODELS.has(model)) {
    return process.env.GROQ_VISION_MODEL || CURRENT_GROQ_VISION_MODEL;
  }
  return model;
}

export function isDecommissionedGroqVisionModel(model: string | null | undefined): boolean {
  return !!model && DECOMMISSIONED_GROQ_VISION_MODELS.has(model);
}

/** Platform-wide AI settings (admin). One row applies to all companies. */
export async function getGlobalAIConfigurationRow(): Promise<AIConfigurationRow | null> {
  return prisma.aIConfiguration.findFirst({
    orderBy: { id: 'asc' },
  });
}

/**
 * DB column wins when non-empty; env is only used when the column is null/blank.
 */
function resolveGroqKey(storedInDb: string | null | undefined): {
  key: string | null;
  source: 'database' | 'environment' | null;
} {
  const stored = storedInDb?.trim();
  if (stored) {
    return { key: decryptStoredSecret(stored), source: 'database' };
  }
  const fromEnv = ENV_GROQ_KEY();
  if (fromEnv) return { key: fromEnv, source: 'environment' };
  return { key: null, source: null };
}

function resolveGoogleKey(storedInDb: string | null | undefined): {
  key: string | null;
  source: 'database' | 'environment' | null;
} {
  const stored = storedInDb?.trim();
  if (stored) {
    return { key: decryptStoredSecret(stored), source: 'database' };
  }
  const fromEnv = ENV_GOOGLE_KEY();
  if (fromEnv) return { key: fromEnv, source: 'environment' };
  return { key: null, source: null };
}

function buildConfig(row: AIConfigurationRow | null): AIConfig {
  const groq = resolveGroqKey(row?.groqApiKey);
  const google = resolveGoogleKey(row?.googleApiKey);

  return {
    enabled: row?.enabled ?? DEFAULT_CONFIG.enabled,
    provider: row?.provider ?? DEFAULT_CONFIG.provider,
    model: row?.model ?? DEFAULT_CONFIG.model,
    visionModel: resolveGroqVisionModel(row?.visionModel ?? DEFAULT_CONFIG.visionModel),
    photoVerification: row?.photoVerification ?? DEFAULT_CONFIG.photoVerification,
    assignmentRecommend: row?.assignmentRecommend ?? DEFAULT_CONFIG.assignmentRecommend,
    insightsEnabled: row?.insightsEnabled ?? DEFAULT_CONFIG.insightsEnabled,
    minPhotoScore: row?.minPhotoScore ?? DEFAULT_CONFIG.minPhotoScore,
    apiKey: groq.key,
    googleApiKey: google.key,
    googleModel: row?.googleModel || DEFAULT_CONFIG.googleModel,
    googleVisionModel: row?.googleVisionModel || DEFAULT_CONFIG.googleVisionModel,
    groqKeySource: groq.source,
    googleKeySource: google.source,
  };
}

/** Global TidyFlow AI settings for the whole platform. `companyId` is ignored if passed. */
export async function getAIConfig(_companyId?: number): Promise<AIConfig> {
  const row = await prisma.aIConfiguration.findFirst({
    orderBy: { id: 'asc' },
  });

  if (row && isDecommissionedGroqVisionModel(row.visionModel)) {
    const fixed = resolveGroqVisionModel(row.visionModel);
    prisma.aIConfiguration
      .update({
        where: { id: row.id },
        data: { visionModel: fixed },
      })
      .catch((err) =>
        console.warn('[AI Config] Failed to persist Groq vision model fix:', err?.message || err)
      );
  }

  return buildConfig(row);
}

export interface UpsertAIConfigInput {
  enabled?: boolean;
  model?: string;
  visionModel?: string;
  photoVerification?: boolean;
  assignmentRecommend?: boolean;
  insightsEnabled?: boolean;
  minPhotoScore?: number;
  googleModel?: string;
  googleVisionModel?: string;
  /** Plaintext key — encrypted before storage. Empty string clears DB key (env fallback). */
  groqApiKey?: string;
  googleApiKey?: string;
}

export async function upsertAIConfig(data: UpsertAIConfigInput) {
  const { groqApiKey, googleApiKey, ...rest } = data;

  const keyUpdates: Record<string, string | null> = {};
  if (groqApiKey !== undefined) {
    keyUpdates.groqApiKey = groqApiKey.trim() ? encryptSecret(groqApiKey.trim()) : null;
  }
  if (googleApiKey !== undefined) {
    keyUpdates.googleApiKey = googleApiKey.trim() ? encryptSecret(googleApiKey.trim()) : null;
  }

  const addingKey =
    (groqApiKey !== undefined && !!groqApiKey.trim()) ||
    (googleApiKey !== undefined && !!googleApiKey.trim());

  const settings = {
    ...rest,
    ...(addingKey && rest.enabled !== false ? { enabled: true } : {}),
  };

  const existing = await prisma.aIConfiguration.findFirst({
    orderBy: { id: 'asc' },
    select: { id: true },
  });

  if (existing) {
    return prisma.aIConfiguration.update({
      where: { id: existing.id },
      data: {
        ...settings,
        ...keyUpdates,
      },
    });
  }

  const company = await prisma.company.findFirst({
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (!company) {
    throw new Error('Cannot save AI configuration: no company exists in the database');
  }

  return prisma.aIConfiguration.create({
    data: {
      companyId: company.id,
      ...DEFAULT_CONFIG,
      ...settings,
      ...keyUpdates,
    },
  });
}

export function hasAIProviderKeys(config: AIConfig): boolean {
  return !!(config.apiKey || config.googleApiKey);
}

export function isAIEnabled(config: AIConfig): boolean {
  return config.enabled && hasAIProviderKeys(config);
}
