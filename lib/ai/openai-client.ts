import { getAIConfig, type AIConfig } from './config';

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentPart[];
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface OpenAIChatOptions {
  companyId?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function openaiChat(
  messages: OpenAIMessage[],
  options: OpenAIChatOptions = {}
): Promise<string> {
  const config = await getAIConfig(options.companyId);

  if (!isConfigured(config)) {
    throw new Error(
      'TidyFlow AI is not configured. Add an OpenAI API key in TidyFlow AI settings or set OPENAI_API_KEY.'
    );
  }

  const model = options.model || config.openaiModel;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
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
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function openaiVisionAnalysis(
  imageUrl: string,
  prompt: string,
  companyId?: number
): Promise<string> {
  const config = await getAIConfig(companyId);

  if (!isConfigured(config)) {
    throw new Error(
      'TidyFlow AI is not configured. Add an OpenAI API key in TidyFlow AI settings or set OPENAI_API_KEY.'
    );
  }

  const visionModel = config.openaiVisionModel || 'gpt-4o';

  const messages: OpenAIMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ];

  console.log(`[AI Vision] Calling OpenAI (model: ${visionModel})`);
  return openaiChat(messages, {
    companyId,
    model: visionModel,
    temperature: 0.2,
    jsonMode: true,
  });
}

function isConfigured(config: AIConfig): boolean {
  return config.enabled && !!config.openaiApiKey;
}
