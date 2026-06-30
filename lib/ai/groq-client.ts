import { getAIConfig, resolveGroqVisionModel, CURRENT_GROQ_VISION_MODEL, type AIConfig } from './config';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | GroqContentPart[];
}

export interface GroqContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface GroqChatOptions {
  companyId?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function groqChat(
  messages: GroqMessage[],
  options: GroqChatOptions = {}
): Promise<string> {
  const config = await getAIConfig(options.companyId);

  if (!isConfigured(config)) {
    throw new Error('TidyFlow AI is not configured. Add a Groq API key in TidyFlow AI settings or set GROQ_API_KEY.');
  }

  const model = options.model || config.model;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function groqVisionAnalysis(
  imageUrl: string,
  prompt: string,
  companyId?: number
): Promise<string> {
  const config = await getAIConfig(companyId);

  if (!isConfigured(config)) {
    throw new Error('TidyFlow AI is not configured. Add a Groq API key in TidyFlow AI settings or set GROQ_API_KEY.');
  }

  const visionModel = resolveGroqVisionModel(config.visionModel);

  const messages: GroqMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ];

  const chatOpts = {
    companyId,
    temperature: 0.2,
    jsonMode: true,
  } as const;

  try {
    console.log(`[AI Vision] Calling Groq (model: ${visionModel})`);
    return await groqChat(messages, { ...chatOpts, model: visionModel });
  } catch (error: any) {
    const msg = error?.message || String(error);
    const isDecommissioned =
      msg.includes('model_decommissioned') || msg.includes('llama-3.2-90b-vision-preview');

    if (isDecommissioned && visionModel !== CURRENT_GROQ_VISION_MODEL) {
      console.warn(
        `[AI Vision] Groq model ${visionModel} unavailable, retrying with ${CURRENT_GROQ_VISION_MODEL}`
      );
      return groqChat(messages, { ...chatOpts, model: CURRENT_GROQ_VISION_MODEL });
    }

    throw error;
  }
}

function isConfigured(config: AIConfig): boolean {
  return config.enabled && !!config.apiKey;
}

export function parseJSONResponse<T>(text: string): T {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned) as T;
}
