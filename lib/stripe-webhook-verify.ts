import Stripe from 'stripe';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_placeholder', {
  apiVersion: '2023-10-16',
});

export async function getStripeWebhookSecrets(): Promise<string[]> {
  const secrets = new Set<string>();

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'stripe_webhook_secret' },
    });
    if (setting?.value) {
      secrets.add(setting.isEncrypted ? decrypt(setting.value) : setting.value);
    }
  } catch (error) {
    console.warn('Failed to fetch Stripe webhook secret from settings:', error);
  }

  if (process.env.STRIPE_WEBHOOK_SECRET) {
    secrets.add(process.env.STRIPE_WEBHOOK_SECRET.trim());
  }

  if (process.env.STRIPE_WEBHOOK_SECRETS) {
    for (const part of process.env.STRIPE_WEBHOOK_SECRETS.split(',')) {
      const trimmed = part.trim();
      if (trimmed) secrets.add(trimmed);
    }
  }

  return Array.from(secrets).filter((s) => s.startsWith('whsec_'));
}

export function verifyStripeWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secrets: string[]
): Stripe.Event {
  if (!secrets.length) {
    throw new Error(
      'Stripe webhook secret not configured. Set stripe_webhook_secret in Admin Settings or STRIPE_WEBHOOK_SECRET in .env'
    );
  }

  let lastError: unknown;

  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Stripe webhook signature verification failed for all configured secrets');
}
