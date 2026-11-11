import { getAIConfig, type AIConfig, type AIProviderId } from './config';
import { groqChat, groqVisionAnalysis, type GroqMessage } from './groq-client';
import {
  googleAIChat,
  googleAIVisionFromUrl,
  type AIMessage,
} from './google-ai-client';
import { openaiChat, openaiVisionAnalysis, type OpenAIMessage } from './openai-client';
import { withAILanguage, withAILanguagePrompt } from './language';

export type { AIMessage };
export { parseJSONResponse } from './groq-client';

export interface AIChatOptions {
  companyId?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** App locale (en, pt, es, ar) — AI text output follows this language */
  locale?: string | null;
}

export interface AIResult {
  text: string;
  provider: 'openai' | 'groq' | 'google';
  model: string;
}

function groqConfigured(config: AIConfig): boolean {
  return config.enabled && !!config.apiKey;
}

function googleConfigured(config: AIConfig): boolean {
  return config.enabled && !!config.googleApiKey;
}

function openaiConfigured(config: AIConfig): boolean {
  return config.enabled && !!config.openaiApiKey;
}

function providerConfigured(config: AIConfig, provider: AIProviderId): boolean {
  if (provider === 'groq') return groqConfigured(config);
  if (provider === 'google') return googleConfigured(config);
  return openaiConfigured(config);
}

function toGroqMessages(messages: AIMessage[]): GroqMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content as GroqMessage['content'],
  }));
}

function toOpenAIMessages(messages: AIMessage[]): OpenAIMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content as OpenAIMessage['content'],
  }));
}

async function tryChatProvider(
  provider: AIProviderId,
  localizedMessages: AIMessage[],
  config: AIConfig,
  options: AIChatOptions
): Promise<AIResult> {
  if (provider === 'groq') {
    const model = options.model || config.model;
    const text = await groqChat(toGroqMessages(localizedMessages), {
      companyId: options.companyId,
      model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      jsonMode: options.jsonMode,
    });
    return { text, provider: 'groq', model };
  }

  if (provider === 'google') {
    const model = options.model || config.googleModel || 'gemini-2.0-flash';
    const text = await googleAIChat(localizedMessages, {
      companyId: options.companyId,
      model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      jsonMode: options.jsonMode,
    });
    return { text, provider: 'google', model };
  }

  const model = options.model || config.openaiModel || 'gpt-4o-mini';
  const text = await openaiChat(toOpenAIMessages(localizedMessages), {
    companyId: options.companyId,
    model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    jsonMode: options.jsonMode,
  });
  return { text, provider: 'openai', model };
}

async function tryVisionProvider(
  provider: AIProviderId,
  imageUrl: string,
  localizedPrompt: string,
  config: AIConfig,
  companyId?: number
): Promise<AIResult> {
  if (provider === 'groq') {
    console.log(
      `[AI Vision] Trying Groq (model: ${config.visionModel}, key: ${config.groqKeySource || 'missing'})`
    );
    const text = await groqVisionAnalysis(imageUrl, localizedPrompt, companyId);
    console.log('[AI Vision] Groq succeeded');
    return { text, provider: 'groq', model: config.visionModel };
  }

  if (provider === 'google') {
    const model = config.googleVisionModel || 'gemini-2.0-flash';
    console.log(
      `[AI Vision] Trying Google (model: ${model}, key: ${config.googleKeySource || 'missing'})`
    );
    const text = await googleAIVisionFromUrl(imageUrl, localizedPrompt, companyId, true, model);
    console.log('[AI Vision] Google succeeded');
    return { text, provider: 'google', model };
  }

  const model = config.openaiVisionModel || 'gpt-4o';
  console.log(
    `[AI Vision] Trying OpenAI (model: ${model}, key: ${config.openaiKeySource || 'missing'})`
  );
  const text = await openaiVisionAnalysis(imageUrl, localizedPrompt, companyId);
  console.log('[AI Vision] OpenAI succeeded');
  return { text, provider: 'openai', model };
}

const PROVIDER_LABEL: Record<AIProviderId, string> = {
  groq: 'Groq',
  google: 'Google',
  openai: 'OpenAI',
};

export async function aiChat(
  messages: AIMessage[],
  options: AIChatOptions = {}
): Promise<AIResult> {
  const config = await getAIConfig(options.companyId);
  const errors: string[] = [];
  const localizedMessages = withAILanguage(messages, options.locale);

  for (const provider of config.providerPriority) {
    if (!providerConfigured(config, provider)) continue;
    try {
      return await tryChatProvider(provider, localizedMessages, config, options);
    } catch (error: any) {
      errors.push(`${PROVIDER_LABEL[provider]}: ${error.message}`);
      console.warn(`${PROVIDER_LABEL[provider]} AI failed, trying next provider:`, error.message);
    }
  }

  throw new Error(
    errors.length
      ? `All AI providers failed. ${errors.join(' | ')}`
      : 'TidyFlow AI not configured. Set GROQ_API_KEY, GOOGLE_AI_API_KEY, or OPENAI_API_KEY.'
  );
}

export async function aiVisionAnalysis(
  imageUrl: string,
  prompt: string,
  companyId?: number,
  locale?: string | null
): Promise<AIResult> {
  const config = await getAIConfig(companyId);
  const errors: string[] = [];
  const localizedPrompt = withAILanguagePrompt(prompt, locale);

  for (const provider of config.providerPriority) {
    if (!providerConfigured(config, provider)) {
      console.warn(`[AI Vision] ${PROVIDER_LABEL[provider]} skipped — no API key or AI disabled`);
      continue;
    }
    try {
      return await tryVisionProvider(provider, imageUrl, localizedPrompt, config, companyId);
    } catch (error: any) {
      errors.push(`${PROVIDER_LABEL[provider]}: ${error.message}`);
      console.warn(
        `[AI Vision] ${PROVIDER_LABEL[provider]} failed, trying next provider:`,
        error.message
      );
    }
  }

  throw new Error(
    errors.length
      ? `All AI vision providers failed. ${errors.join(' | ')}`
      : 'AI vision not configured.'
  );
}

export function getAIProviderStatus(config: AIConfig) {
  return {
    openai: openaiConfigured(config),
    groq: groqConfigured(config),
    google: googleConfigured(config),
    anyAvailable:
      openaiConfigured(config) || groqConfigured(config) || googleConfigured(config),
    openaiKeySource: config.openaiKeySource,
    groqKeySource: config.groqKeySource,
    googleKeySource: config.googleKeySource,
    providerPriority: config.providerPriority,
  };
}
