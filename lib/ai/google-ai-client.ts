import { getAIConfig, type AIConfig } from './config';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIContentPart[];
}

export interface AIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface GoogleAIOptions {
  companyId?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

function extractTextContent(content: string | AIContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('\n');
}

function extractImageUrl(content: string | AIContentPart[]): string | null {
  if (typeof content === 'string') return null;
  const part = content.find((p) => p.type === 'image_url' && p.image_url?.url);
  return part?.image_url?.url || null;
}

export async function isGoogleAIConfigured(companyId?: number): Promise<boolean> {
  const config = await getAIConfig(companyId);
  return !!config.googleApiKey;
}

export async function googleAIChat(
  messages: AIMessage[],
  options: GoogleAIOptions = {}
): Promise<string> {
  const config = await getAIConfig(options.companyId);
  const apiKey = config.googleApiKey;
  if (!apiKey) {
    throw new Error('Google AI not configured. Add a key in TidyFlow AI settings or set GOOGLE_AI_API_KEY.');
  }

  const model = options.model || config.googleModel || 'gemini-2.0-flash';

  const systemParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => extractTextContent(m.content));

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const text = extractTextContent(m.content);
      const imageUrl = extractImageUrl(m.content);
      const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];

      if (text) parts.push({ text });
      if (imageUrl) {
        parts.push({
          inline_data: {
            mime_type: imageUrl.includes('.png') ? 'image/png' : 'image/jpeg',
            data: '',
          },
        });
      }

      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: parts.length ? parts : [{ text }],
      };
    });

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens ?? 2048,
      ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  if (systemParts.length) {
    body.systemInstruction = { parts: [{ text: systemParts.join('\n') }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google AI error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('') || '';

  if (!text) {
    throw new Error('Google AI returned empty response');
  }

  return text;
}

export async function googleAIVisionFromUrl(
  imageUrl: string,
  prompt: string,
  companyId?: number,
  jsonMode = true,
  modelOverride?: string
): Promise<string> {
  const config = await getAIConfig(companyId);
  const apiKey = config.googleApiKey;
  if (!apiKey) {
    throw new Error('Google AI not configured.');
  }

  const model = modelOverride || config.googleVisionModel || 'gemini-2.0-flash';

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image for analysis: ${imageResponse.status}`);
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google AI vision error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('') || ''
  );
}
