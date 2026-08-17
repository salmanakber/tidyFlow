import { NextRequest } from 'next/server';

export function getRequestLocale(
  request: NextRequest,
  body?: Record<string, unknown> | null
): string | undefined {
  const fromBody = typeof body?.locale === 'string' ? body.locale : undefined;
  const header = request.headers.get('accept-language')?.split(',')[0]?.trim();
  return fromBody || header || undefined;
}
