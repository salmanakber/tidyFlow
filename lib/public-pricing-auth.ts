import { NextRequest } from 'next/server';

/**
 * Public pricing write endpoints (POST/PATCH/DELETE).
 * - GET is always open (for marketing website).
 * - Writes require X-Pricing-Api-Key when PRICING_WEBSITE_API_KEY is set.
 * - If PRICING_WEBSITE_API_KEY is unset, writes are allowed (dev only — set the key in production).
 */
export function requirePricingWebsiteApiKey(request: NextRequest): {
  allowed: boolean;
  message?: string;
} {
  const configuredKey = process.env.PRICING_WEBSITE_API_KEY?.trim();
  if (!configuredKey) {
    return { allowed: true };
  }

  const provided =
    request.headers.get('x-pricing-api-key') ||
    request.headers.get('x-api-key') ||
    '';

  if (provided !== configuredKey) {
    return {
      allowed: false,
      message: 'Invalid or missing X-Pricing-Api-Key header',
    };
  }

  return { allowed: true };
}
