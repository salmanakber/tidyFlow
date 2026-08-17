import { getPublicWebOrigin } from '@/lib/domains';

export function buildClientShareLink(token: string): string {
  const baseUrl = getPublicWebOrigin();
  return `${baseUrl}/share/${token}`;
}
