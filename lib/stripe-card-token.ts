import { createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey } from '@/lib/stripe-settings';

export interface CardTokenInput {
  cardNumber: string;
  expMonth: string | number;
  expYear: string | number;
  cvc: string;
  cardholderName: string;
  email?: string;
}

export interface CardTokenResult {
  /** Stripe PaymentMethod id (pm_xxx) — use this for subscriptions */
  paymentMethodId: string;
  /** Same as paymentMethodId; friendly alias for "card token" */
  cardToken: string;
  brand: string;
  last4: string;
  expMonth: number | undefined;
  expYear: number | undefined;
}

/**
 * Send raw card fields to Stripe from the server and receive a secure token (PaymentMethod).
 * Requires Stripe "raw card data APIs" on the account (test + live).
 */
export async function createStripeCardToken(input: CardTokenInput): Promise<CardTokenResult> {
  const digits = String(input.cardNumber || '').replace(/\s+/g, '');
  const month = parseInt(String(input.expMonth), 10);
  let year = parseInt(String(input.expYear), 10);
  if (year < 100) year += 2000;

  if (!digits || digits.length < 13) {
    throw new Error('Invalid card number');
  }
  if (!month || month < 1 || month > 12) {
    throw new Error('Invalid expiry month');
  }
  if (!year || year < new Date().getFullYear()) {
    throw new Error('Invalid expiry year');
  }
  if (!input.cvc || String(input.cvc).length < 3) {
    throw new Error('Invalid CVC');
  }
  if (!input.cardholderName?.trim()) {
    throw new Error('Cardholder name required');
  }

  const secretKey = await getStripeSecretKey();
  if (!secretKey) {
    throw new Error('Stripe secret key not configured');
  }

  const stripe = createStripeInstance(secretKey);
  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: {
      number: digits,
      exp_month: month,
      exp_year: year,
      cvc: String(input.cvc),
    },
    billing_details: {
      name: String(input.cardholderName).trim(),
      email: input.email ? String(input.email).trim() : undefined,
    },
  });

  return {
    paymentMethodId: paymentMethod.id,
    cardToken: paymentMethod.id,
    brand: paymentMethod.card?.brand || 'card',
    last4: paymentMethod.card?.last4 || '',
    expMonth: paymentMethod.card?.exp_month,
    expYear: paymentMethod.card?.exp_year,
  };
}

export function stripeCardTokenErrorMessage(error: unknown): string {
  const err = error as { raw?: { message?: string }; message?: string };
  const raw = err?.raw?.message || err?.message || '';
  const needsRawCardApi =
    raw.includes('raw card data') ||
    raw.includes('test tokens') ||
    raw.includes('unsafe');

  if (needsRawCardApi) {
    return 'Stripe raw card API is not enabled on this account. Enable it in Stripe Dashboard (Settings → Integration → Advanced) or contact Stripe support, then retry.';
  }
  return raw || 'Could not process card. Check details and try again.';
}
