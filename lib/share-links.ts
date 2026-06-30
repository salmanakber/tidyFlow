export function buildClientShareLink(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://apimayaops.co.uk';
  return `${baseUrl}/share/${token}`;
}
