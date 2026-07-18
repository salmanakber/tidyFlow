import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, generateToken, isValidEmail, isValidPassword } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { type PlanTier } from '@/lib/subscription';
import { createCustomer, createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey, getStripePriceIdForTier } from '@/lib/stripe-settings';
import { getTrialDays } from '@/lib/trial-settings';
import { getAppOrigin } from '@/lib/domains';
import { planSlugToTier } from '@/lib/app-store-links';
import { sendSubscribeWelcomeEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * Public register + Stripe Checkout in one step.
 * Used by /subscribe/[plan] marketing links — no prior login required.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      email,
      password,
      firstName,
      lastName,
      companyName,
      planTier,
      plan,
      useTrial = true,
    } = body as {
      email?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      companyName?: string;
      planTier?: string;
      plan?: string;
      useTrial?: boolean;
    };

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      );
    }
    if (!companyName?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Company name is required' },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, message: 'Invalid email format' }, { status: 400 });
    }

    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, message: passwordValidation.message },
        { status: 400 }
      );
    }

    const tierFromSlug = plan ? planSlugToTier(plan) : null;
    const tier = String(planTier || tierFromSlug || '')
      .toUpperCase()
      .trim() as PlanTier;
    if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tier)) {
      return NextResponse.json(
        { success: false, message: 'Invalid plan. Use startup, standard, or premium.' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: 'An account with this email already exists. Please sign in on the app or web login.',
          code: 'EMAIL_EXISTS',
        },
        { status: 409 }
      );
    }

    const secretKey = await getStripeSecretKey();
    if (!secretKey) {
      return NextResponse.json(
        { success: false, message: 'Payments are not configured yet. Contact support.' },
        { status: 500 }
      );
    }

    const priceId = await getStripePriceIdForTier(tier, 'USD');
    if (!priceId) {
      return NextResponse.json(
        { success: false, message: `Checkout is not configured for the ${tier} plan yet.` },
        { status: 500 }
      );
    }

    const trialDaysSetting = await getTrialDays();
    const trialDays = useTrial ? trialDaysSetting : 0;
    const stripe = createStripeInstance(secretKey);
    const passwordHash = await hashPassword(password);
    const displayName = companyName.trim();
    const checkoutEmail = email.toLowerCase().trim();

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: displayName,
          planTier: tier,
          subscriptionStatus: 'unpaid',
          isTrialActive: false,
          trialEndsAt: null,
        },
      });

      const user = await tx.user.create({
        data: {
          email: checkoutEmail,
          passwordHash,
          firstName: firstName?.trim() || null,
          lastName: lastName?.trim() || null,
          role: UserRole.OWNER,
          companyId: company.id,
        },
      });

      return { company, user };
    });

    const customer = await createCustomer(
      checkoutEmail,
      displayName,
      result.company.id,
      stripe
    );

    await prisma.billingRecord.create({
      data: {
        companyId: result.company.id,
        stripeCustomerId: customer.id,
        status: 'pending_checkout',
        amountDue: 0,
        billingDate: new Date(),
        propertyCount: 0,
      },
    });

    const appOrigin = getAppOrigin();
    const planSlug = tier.toLowerCase();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      client_reference_id: String(result.company.id),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appOrigin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}&from=web&plan=${planSlug}`,
      cancel_url: `${appOrigin}/subscribe/${planSlug}?canceled=1`,
      allow_promotion_codes: true,
      metadata: {
        companyId: String(result.company.id),
        planTier: tier,
        source: 'public_web_subscribe',
      },
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: {
          companyId: String(result.company.id),
          planTier: tier,
          source: 'public_web_subscribe',
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { success: false, message: 'Could not start checkout. Please try again.' },
        { status: 500 }
      );
    }

    const token = generateToken({
      userId: result.user.id,
      email: result.user.email,
      role: result.user.role,
      companyId: result.company.id,
    });

    const welcomeName =
      [result.user.firstName, result.user.lastName].filter(Boolean).join(' ') ||
      displayName;
    const planLabel =
      tier === 'STARTUP' ? 'Startup' : tier === 'STANDARD' ? 'Standard' : 'Premium';
    void sendSubscribeWelcomeEmail({
      recipientEmail: checkoutEmail,
      recipientName: welcomeName,
      companyName: displayName,
      planLabel,
    }).catch((err) => console.error('Subscribe welcome email failed:', err));

    return NextResponse.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
        planTier: tier,
        trialDays,
        token,
        email: checkoutEmail,
      },
    });
  } catch (error) {
    console.error('Public subscribe error:', error);
    return NextResponse.json(
      { success: false, message: 'Could not start subscription. Please try again.' },
      { status: 500 }
    );
  }
}
