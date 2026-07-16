import crypto from 'crypto';
import prisma from '@/lib/prisma';

const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'default-key-change-in-production';
const ALGORITHM = 'aes-256-cbc';

function getKeyBuffer() {
  return Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0'));
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptSecret(value: string): string {
  try {
    const parts = value.split(':');
    if (parts.length < 2) return value;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return value;
  }
}

export type SettingCategory = 'ai' | 'smtp' | 'discovery' | 'behaviour' | 'limits' | 'general';

export async function getSetting(key: string): Promise<string | null> {
  const row = await (prisma as any).saModuleSetting.findUnique({ where: { key } });
  if (!row) return null;
  return row.isEncrypted ? decryptSecret(row.value) : row.value;
}

export async function getSettingsByCategory(category: SettingCategory): Promise<Record<string, string>> {
  const rows = await (prisma as any).saModuleSetting.findMany({ where: { category } });
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key] = row.isEncrypted ? decryptSecret(row.value) : row.value;
  }
  return out;
}

export async function getAllSettingsMasked(): Promise<
  Array<{ key: string; value: string; category: string; isEncrypted: boolean; hasValue: boolean }>
> {
  const rows = await (prisma as any).saModuleSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
  return rows.map((row: any) => ({
    key: row.key,
    category: row.category,
    isEncrypted: row.isEncrypted,
    hasValue: !!row.value,
    value: row.isEncrypted ? (row.value ? '••••••••' : '') : row.value,
  }));
}

export async function upsertSetting(
  key: string,
  value: string,
  category: SettingCategory,
  opts: { encrypt?: boolean; description?: string; updatedById?: number } = {}
) {
  const shouldEncrypt = opts.encrypt ?? false;
  const stored = shouldEncrypt && value && !value.startsWith('••••') ? encryptSecret(value) : value;
  if (value.startsWith('••••')) return; // keep existing secret

  await (prisma as any).saModuleSetting.upsert({
    where: { key },
    create: {
      key,
      value: stored,
      category,
      isEncrypted: shouldEncrypt,
      description: opts.description,
      updatedById: opts.updatedById,
    },
    update: {
      value: stored,
      category,
      isEncrypted: shouldEncrypt,
      description: opts.description,
      updatedById: opts.updatedById,
    },
  });
}

export async function upsertSettings(
  entries: Array<{ key: string; value: string; category: SettingCategory; encrypt?: boolean }>,
  updatedById?: number
) {
  for (const entry of entries) {
    if (entry.value === undefined || entry.value === null) continue;
    await upsertSetting(entry.key, entry.value, entry.category, {
      encrypt: entry.encrypt,
      updatedById,
    });
  }
}

export interface SalesAgentAIConfig {
  groqApiKey: string;
  groqModel: string;
  groqTemperature: number;
  groqMaxTokens: number;
  geminiApiKey: string;
  geminiModel: string;
  geminiTemperature: number;
  geminiMaxTokens: number;
  leadScoreThreshold: number;
  autoAnalyze: boolean;
  autoEmailGeneration: boolean;
  autoFollowUp: boolean;
  aiRetryCount: number;
  aiTimeoutMs: number;
  dailyAiLimit: number;
}

export async function getSalesAgentAIConfig(): Promise<SalesAgentAIConfig> {
  const ai = await getSettingsByCategory('ai');
  const behaviour = await getSettingsByCategory('behaviour');
  const limits = await getSettingsByCategory('limits');

  return {
    groqApiKey: ai.groq_api_key || process.env.GROQ_API_KEY || '',
    groqModel: ai.groq_model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    groqTemperature: parseFloat(ai.groq_temperature || '0.3'),
    groqMaxTokens: parseInt(ai.groq_max_tokens || '2048', 10),
    geminiApiKey: ai.gemini_api_key || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
    geminiModel: ai.gemini_model || process.env.GOOGLE_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    geminiTemperature: parseFloat(ai.gemini_temperature || '0.3'),
    geminiMaxTokens: parseInt(ai.gemini_max_tokens || '2048', 10),
    leadScoreThreshold: parseInt(behaviour.lead_score_threshold || '50', 10),
    autoAnalyze: (behaviour.auto_analyze || 'true') === 'true',
    autoEmailGeneration: (behaviour.auto_email_generation || 'false') === 'true',
    autoFollowUp: (behaviour.auto_follow_up || 'false') === 'true',
    aiRetryCount: parseInt(behaviour.ai_retry_count || '2', 10),
    aiTimeoutMs: parseInt(behaviour.ai_timeout_ms || '45000', 10),
    dailyAiLimit: parseInt(limits.daily_ai_limit || '500', 10),
  };
}

export interface SalesAgentSmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  dailyLimit: number;
  hourlyLimit: number;
}

export async function getSalesAgentSmtpConfig(): Promise<SalesAgentSmtpConfig> {
  const smtp = await getSettingsByCategory('smtp');
  const limits = await getSettingsByCategory('limits');
  return {
    host: smtp.smtp_host || process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(smtp.smtp_port || process.env.BREVO_SMTP_PORT || '587', 10),
    username: smtp.smtp_username || process.env.BREVO_SMTP_USER || '',
    password: smtp.smtp_password || process.env.BREVO_SMTP_PASS || '',
    senderEmail: smtp.sender_email || process.env.EMAIL_FROM || 'noreply@tidyflowapp.com',
    senderName: smtp.sender_name || 'TidyFlow',
    replyToEmail: smtp.reply_to_email || smtp.sender_email || process.env.EMAIL_FROM || '',
    dailyLimit: parseInt(limits.daily_email_limit || '100', 10),
    hourlyLimit: parseInt(limits.hourly_email_limit || '20', 10),
  };
}

export async function getDiscoveryConfig() {
  const d = await getSettingsByCategory('discovery');
  return {
    googlePlacesApiKey: d.google_places_api_key || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '',
    searchEngine: d.search_engine || 'duckduckgo',
    searchDelayMs: parseInt(d.search_delay_ms || '1500', 10),
    maxResults: parseInt(d.max_results || '20', 10),
    concurrentWorkers: parseInt(d.concurrent_workers || '3', 10),
    bookingLink: d.booking_link || process.env.NEXT_PUBLIC_APP_URL || 'https://tidyflowapp.com',
  };
}
