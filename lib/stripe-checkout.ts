import Stripe from 'stripe';
import { createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey, getStripePriceIdForTier } from '@/lib/stripe-settings';
import { getTrialDays } from '@/lib/trial-settings';
import { getAppOrigin } from '@/lib/domains';
import type { PlanTier } from '@/lib/subscription';

export function stripeKeyMode(secretKey: string): 'test' | 'live' | 'unknown' {
  if (secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_')) return 'test';
  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) return 'live';
  return 'unknown';
}

export function isStripeError(error: unknown): error is Stripe.errors.StripeError {
  return !!(error && typeof error === 'object' && (error as Stripe.errors.StripeError).type);
}

export function mapStripeError(error: unknown): { message: string; code?: string; status: number } {
  if (!isStripeError(error)) {
    const msg = error instanceof Error ? error.message : 'Payment provider error';
    return { message: msg, status: 500 };
  }

  const raw = error.message || 'Stripe request failed';
  const lower = raw.toLowerCase();

  if (lower.includes('similar object exists in') || lower.includes('no such price') || lower.includes('no such customer')) {
    return {
      message:
        'Stripe test/live mismatch. The secret key, price IDs, and any saved customers must all be from the same mode (all test or all live). Update Admin → Stripe, then retry.',
      code: 'STRIPE_MODE_MISMATCH',
      status: 400,
    };
  }

  if (lower.includes('trial_period_days') || lower.includes('already has a trial')) {
    return {
      message:
        'This Stripe Price already includes a free trial. TidyFlow will use that trial instead of sending extra trial days. Save settings and try again.',
      code: 'STRIPE_TRIAL_CONFLICT',
      status: 400,
    };
  }

  if (lower.includes('invalid api key') || lower.includes('expired api key')) {
    return {
      message: 'Stripe secret key is invalid. Paste a fresh sk_test_… or sk_live_… in Admin → Stripe.',
      code: 'STRIPE_BAD_KEY',
      status: 400,
    };
  }

  return { message: raw, code: error.code, status: error.statusCode || 400 };
}

/**
 * Resolve the paid recurring Price for a tier.
 * Keep ONE paid monthly Price ID per plan. Do not store a separate $0 trial Price.
 * Trials are applied with trial_period_days unless Stripe already set a trial on that Price.
 */
export async function resolveCheckoutPrice(opts: {
  stripe: Stripe;
  tier: PlanTier;
  currency?: string;
  useTrial: boolean;
}): Promise<{
  priceId: string;
  trialDays: number;
  priceHasBuiltinTrial: boolean;
  priceLivemode: boolean;
}> {
  const priceId = await getStripePriceIdForTier(opts.tier, opts.currency || 'USD');
  if (!priceId) {
    throw Object.assign(new Error(`Checkout is not configured for the ${opts.tier} plan yet.`), {
      statusCode: 500,
    });
  }

  let price: Stripe.Price;
  try {
    price = await opts.stripe.prices.retrieve(priceId);
  } catch (err) {
    const mapped = mapStripeError(err);
    throw Object.assign(new Error(mapped.message), { statusCode: mapped.status, code: mapped.code });
  }

  const builtinTrial = Number(price.recurring?.trial_period_days || 0);
  const requested = opts.useTrial ? await getTrialDays() : 0;
  // If Stripe's Price already has a trial, Checkout applies it automatically.
  // Sending trial_period_days again causes a 400.
  const trialDays = builtinTrial > 0 ? 0 : requested;

  return {
    priceId,
    trialDays,
    priceHasBuiltinTrial: builtinTrial > 0,
    priceLivemode: !!price.livemode,
  };
}

export async function createPlanCheckoutSession(opts: {
  stripe: Stripe;
  customerId: string;
  companyId: number;
  tier: PlanTier;
  priceId: string;
  trialDays: number;
  source: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<Stripe.Checkout.Session> {
  const appOrigin = getAppOrigin();
  const planSlug = opts.tier.toLowerCase();

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    customer: opts.customerId,
    client_reference_id: String(opts.companyId),
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url:
      opts.successUrl ||
      `${appOrigin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}&from=web&plan=${planSlug}`,
    cancel_url: opts.cancelUrl || `${appOrigin}/subscribe/${planSlug}?canceled=1`,
    allow_promotion_codes: true,
    metadata: {
      companyId: String(opts.companyId),
      planTier: opts.tier,
      source: opts.source,
    },
    subscription_data: {
      ...(opts.trialDays > 0 ? { trial_period_days: opts.trialDays } : {}),
      metadata: {
        companyId: String(opts.companyId),
        planTier: opts.tier,
        source: opts.source,
      },
    },
  };

  try {
    return await opts.stripe.checkout.sessions.create(params);
  } catch (err) {
    const msg = String((err as any)?.message || '').toLowerCase();
    if (opts.trialDays > 0 && (msg.includes('trial_period_days') || msg.includes('already has a trial'))) {
      const retry = { ...params, subscription_data: { ...params.subscription_data } };
      delete (retry.subscription_data as { trial_period_days?: number }).trial_period_days;
      return opts.stripe.checkout.sessions.create(retry);
    }
    throw err;
  }
}

export async function getStripeClientOrThrow() {
  const secretKey = await getStripeSecretKey();
  if (!secretKey) {
    throw Object.assign(new Error('Payments are not configured yet. Contact support.'), {
      statusCode: 500,
    });
  }
  return { secretKey, stripe: createStripeInstance(secretKey), mode: stripeKeyMode(secretKey) };
}

export async function validateStripeConfigForAdmin() {
  const { secretKey, stripe, mode } = await getStripeClientOrThrow();
  const tiers: PlanTier[] = ['STARTUP', 'STANDARD', 'PREMIUM'];
  const prices: Array<{
    tier: PlanTier;
    priceId: string;
    ok: boolean;
    livemode?: boolean;
    builtinTrialDays?: number;
    error?: string;
  }> = [];

  for (const tier of tiers) {
    const priceId = await getStripePriceIdForTier(tier, 'USD');
    if (!priceId) {
      prices.push({ tier, priceId: '', ok: false, error: 'No price ID saved' });
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(priceId);
      prices.push({
        tier,
        priceId,
        ok: true,
        livemode: price.livemode,
        builtinTrialDays: Number(price.recurring?.trial_period_days || 0),
      });
    } catch (err) {
      prices.push({
        tier,
        priceId,
        ok: false,
        error: mapStripeError(err).message,
      });
    }
  }

  const mixed = prices.some((p) => p.ok && mode === 'test' && p.livemode) ||
    prices.some((p) => p.ok && mode === 'live' && p.livemode === false);

  return {
    mode,
    keyHint: secretKey.slice(0, 8) + '…',
    mixedMode: mixed,
    prices,
  };
}
