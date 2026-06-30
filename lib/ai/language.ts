import type { AIMessage } from './google-ai-client';

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  pt: 'Portuguese',
  es: 'Spanish',
  ar: 'Arabic',
};

export function resolveAILocale(locale?: string | null): string {
  if (!locale) return 'en';
  const code = locale.split('-')[0].toLowerCase();
  return LOCALE_NAMES[code] ? code : 'en';
}

export function aiLanguageInstruction(locale?: string | null): string {
  const code = resolveAILocale(locale);
  const name = LOCALE_NAMES[code];
  return `IMPORTANT: Write ALL human-readable text (titles, messages, reasons, summaries, descriptions, checklist items, flags, insights) in ${name} (locale: ${code}). Keep JSON property keys in English. Do not mix languages.`;
}

export function withAILanguage(messages: AIMessage[], locale?: string | null): AIMessage[] {
  const instruction = aiLanguageInstruction(locale);
  const systemIdx = messages.findIndex((m) => m.role === 'system');
  if (systemIdx >= 0) {
    return messages.map((m, i) =>
      i === systemIdx
        ? { ...m, content: `${String(m.content)}\n\n${instruction}` }
        : m
    );
  }
  return [{ role: 'system', content: instruction }, ...messages];
}

export function withAILanguagePrompt(prompt: string, locale?: string | null): string {
  return `${prompt}\n\n${aiLanguageInstruction(locale)}`;
}
