import { getSalesAgentAIConfig } from './config';
import { logAiUsage, saLog } from './logger';
import prisma from '@/lib/prisma';

export type AIProviderName = 'groq' | 'gemini';

export interface SalesAgentChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SalesAgentAIResult {
  text: string;
  provider: AIProviderName;
  model: string;
  latencyMs: number;
}

async function checkDailyAiLimit(): Promise<boolean> {
  const config = await getSalesAgentAIConfig();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const count = await (prisma as any).saAiUsageLog.count({
    where: { createdAt: { gte: start }, success: true },
  });
  return count < config.dailyAiLimit;
}

async function callGroq(
  messages: SalesAgentChatMessage[],
  opts: { model: string; temperature: number; maxTokens: number; apiKey: string; timeoutMs: number; jsonMode?: boolean }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Groq error (${response.status}): ${body}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  messages: SalesAgentChatMessage[],
  opts: { model: string; temperature: number; maxTokens: number; apiKey: string; timeoutMs: number; jsonMode?: boolean }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${opts.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxTokens,
          ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini error (${response.status}): ${body}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } finally {
    clearTimeout(timer);
  }
}

/** Provider abstraction: Groq primary → Gemini fallback. Extensible for future providers. */
export async function salesAgentChat(
  messages: SalesAgentChatMessage[],
  options: { action?: string; jsonMode?: boolean; companyId?: number } = {}
): Promise<SalesAgentAIResult> {
  const config = await getSalesAgentAIConfig();
  const action = options.action || 'chat';

  if (!(await checkDailyAiLimit())) {
    throw new Error('Daily AI usage limit reached for Sales Agent');
  }

  const errors: string[] = [];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.aiRetryCount; attempt++) {
    if (config.groqApiKey) {
      const started = Date.now();
      try {
        const text = await callGroq(messages, {
          apiKey: config.groqApiKey,
          model: config.groqModel,
          temperature: config.groqTemperature,
          maxTokens: config.groqMaxTokens,
          timeoutMs: config.aiTimeoutMs,
          jsonMode: options.jsonMode,
        });
        const latencyMs = Date.now() - started;
        await logAiUsage({
          provider: 'groq',
          model: config.groqModel,
          action,
          success: true,
          latencyMs,
          companyId: options.companyId,
        });
        return { text, provider: 'groq', model: config.groqModel, latencyMs };
      } catch (err: any) {
        lastError = err;
        errors.push(`Groq: ${err.message}`);
        await logAiUsage({
          provider: 'groq',
          model: config.groqModel,
          action,
          success: false,
          error: err.message,
          latencyMs: Date.now() - started,
          companyId: options.companyId,
        });
        await saLog({
          level: 'warn',
          category: 'ai',
          action: 'groq_fallback',
          message: err.message,
          success: false,
        });
      }
    }

    if (config.geminiApiKey) {
      const started = Date.now();
      try {
        const text = await callGemini(messages, {
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
          temperature: config.geminiTemperature,
          maxTokens: config.geminiMaxTokens,
          timeoutMs: config.aiTimeoutMs,
          jsonMode: options.jsonMode,
        });
        const latencyMs = Date.now() - started;
        await logAiUsage({
          provider: 'gemini',
          model: config.geminiModel,
          action,
          success: true,
          latencyMs,
          companyId: options.companyId,
        });
        return { text, provider: 'gemini', model: config.geminiModel, latencyMs };
      } catch (err: any) {
        lastError = err;
        errors.push(`Gemini: ${err.message}`);
        await logAiUsage({
          provider: 'gemini',
          model: config.geminiModel,
          action,
          success: false,
          error: err.message,
          latencyMs: Date.now() - started,
          companyId: options.companyId,
        });
      }
    }
  }

  throw lastError || new Error(`Sales Agent AI failed: ${errors.join(' | ')}`);
}

export function parseJsonLoose<T = any>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error('Failed to parse AI JSON response');
  }
}
