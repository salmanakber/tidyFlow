import { NextRequest, NextResponse } from 'next/server';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import {
  getAllSettingsMasked,
  getSalesAgentAIConfig,
  upsertSettings,
} from '@/lib/sales-agent/config';
import prisma from '@/lib/prisma';
import { saLog } from '@/lib/sales-agent/logger';
import { testSalesAgentProvider } from '@/lib/sales-agent/ai-provider';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const config = await getSalesAgentAIConfig();
  const settings = await getAllSettingsMasked();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [usageToday, usageMonth, byProvider] = await Promise.all([
    (prisma as any).saAiUsageLog.count({ where: { createdAt: { gte: today }, success: true } }),
    (prisma as any).saAiUsageLog.count({ where: { createdAt: { gte: monthStart }, success: true } }),
    (prisma as any).saAiUsageLog.groupBy({
      by: ['provider'],
      where: { createdAt: { gte: monthStart } },
      _count: { _all: true },
    }),
  ]);

  return jsonOk({
    config: {
      ...config,
      groqApiKey: config.groqApiKey ? '••••••••' : '',
      geminiApiKey: config.geminiApiKey ? '••••••••' : '',
      hasGroqKey: !!config.groqApiKey,
      hasGeminiKey: !!config.geminiApiKey,
    },
    settings,
    usage: {
      today: usageToday,
      month: usageMonth,
      byProvider: byProvider.map((p: any) => ({ provider: p.provider, count: p._count._all })),
      dailyLimit: config.dailyAiLimit,
    },
  });
}

export async function PUT(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  const entries: Array<{ key: string; value: string; category: any; encrypt?: boolean }> = [];

  const map: Array<[string, string, any, boolean?]> = [
    ['groqApiKey', 'groq_api_key', 'ai', true],
    ['groqModel', 'groq_model', 'ai'],
    ['groqTemperature', 'groq_temperature', 'ai'],
    ['groqMaxTokens', 'groq_max_tokens', 'ai'],
    ['geminiApiKey', 'gemini_api_key', 'ai', true],
    ['geminiModel', 'gemini_model', 'ai'],
    ['geminiTemperature', 'gemini_temperature', 'ai'],
    ['geminiMaxTokens', 'gemini_max_tokens', 'ai'],
    ['leadScoreThreshold', 'lead_score_threshold', 'behaviour'],
    ['autoAnalyze', 'auto_analyze', 'behaviour'],
    ['autoEmailGeneration', 'auto_email_generation', 'behaviour'],
    ['autoFollowUp', 'auto_follow_up', 'behaviour'],
    ['aiRetryCount', 'ai_retry_count', 'behaviour'],
    ['aiTimeoutMs', 'ai_timeout_ms', 'behaviour'],
    ['dailyAiLimit', 'daily_ai_limit', 'limits'],
  ];

  for (const [bodyKey, dbKey, category, encrypt] of map) {
    if (body[bodyKey] !== undefined && body[bodyKey] !== null) {
      entries.push({
        key: dbKey,
        value: String(body[bodyKey]),
        category,
        encrypt,
      });
    }
  }

  await upsertSettings(entries, gate.userId);
  await saLog({
    category: 'user',
    action: 'ai_config_updated',
    message: 'AI configuration updated',
    userId: gate.userId,
  });

  return jsonOk({ saved: true });
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === 'test_groq' || action === 'test_gemini') {
    const provider = action === 'test_groq' ? 'groq' : 'gemini';
    const result = await testSalesAgentProvider(provider as 'groq' | 'gemini');
    return jsonOk(result);
  }

  return jsonError('Unknown action');
}
