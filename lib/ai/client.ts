import { getAIConfig, type AIConfig } from './config';
import { groqChat, groqVisionAnalysis, type GroqMessage } from './groq-client';
import {
  googleAIChat,
  googleAIVisionFromUrl,
  type AIMessage,
} from './google-ai-client';
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
  provider: 'groq' | 'google';
  model: string;
}

function groqConfigured(config: AIConfig): boolean {
  return config.enabled && !!config.apiKey;
}

function googleConfigured(config: AIConfig): boolean {
  return config.enabled && !!config.googleApiKey;
}

function toGroqMessages(messages: AIMessage[]): GroqMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content as GroqMessage['content'],
  }));
}

export async function aiChat(
  messages: AIMessage[],
  options: AIChatOptions = {}
): Promise<AIResult> {
  const config = await getAIConfig(options.companyId);
  const errors: string[] = [];
  const localizedMessages = withAILanguage(messages, options.locale);

  if (groqConfigured(config)) {
    try {
      const text = await groqChat(toGroqMessages(localizedMessages), {
        companyId: options.companyId,
        model: options.model || config.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        jsonMode: options.jsonMode,
      });
      return { text, provider: 'groq', model: options.model || config.model };
    } catch (error: any) {
      errors.push(`Groq: ${error.message}`);
      console.warn('Groq AI failed, trying Google AI fallback:', error.message);
    }
  }

  if (googleConfigured(config)) {
    try {
      const model = options.model || config.googleModel || 'gemini-2.0-flash';
      const text = await googleAIChat(localizedMessages, {
        companyId: options.companyId,
        model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        jsonMode: options.jsonMode,
      });
      return { text, provider: 'google', model };
    } catch (error: any) {
      errors.push(`Google: ${error.message}`);
      console.error('Google AI fallback failed:', error.message);
    }
  }

  throw new Error(
    errors.length
      ? `All AI providers failed. ${errors.join(' | ')}`
      : 'TidyFlow AI not configured. Set GROQ_API_KEY or GOOGLE_AI_API_KEY.'
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

  if (groqConfigured(config)) {
    try {
      console.log(
        `[AI Vision] Primary: Groq (model: ${config.visionModel}, key: ${config.groqKeySource || 'missing'})`
      );
      const text = await groqVisionAnalysis(imageUrl, localizedPrompt, companyId);
      console.log('[AI Vision] Groq succeeded');
      return { text, provider: 'groq', model: config.visionModel };
    } catch (error: any) {
      errors.push(`Groq: ${error.message}`);
      console.warn('[AI Vision] Groq failed, trying Google fallback:', error.message);
    }
  } else {
    console.warn('[AI Vision] Groq skipped — no API key or AI disabled');
  }

  if (googleConfigured(config)) {
    try {
      const model = config.googleVisionModel || 'gemini-2.0-flash';
      console.log(
        `[AI Vision] Fallback: Google (model: ${model}, key: ${config.googleKeySource || 'missing'})`
      );
      const text = await googleAIVisionFromUrl(imageUrl, localizedPrompt, companyId, true, model);
      console.log('[AI Vision] Google succeeded');
      return { text, provider: 'google', model };
    } catch (error: any) {
      errors.push(`Google: ${error.message}`);
      console.error('[AI Vision] Google fallback failed:', error.message);
    }
  } else if (errors.length) {
    console.warn('[AI Vision] Google skipped — no API key');
  }

  throw new Error(
    errors.length
      ? `All AI vision providers failed. ${errors.join(' | ')}`
      : 'AI vision not configured.'
  );
}

export function getAIProviderStatus(config: AIConfig) {
  return {
    groq: groqConfigured(config),
    google: googleConfigured(config),
    anyAvailable: groqConfigured(config) || googleConfigured(config),
    groqKeySource: config.groqKeySource,
    googleKeySource: config.googleKeySource,
  };
}
