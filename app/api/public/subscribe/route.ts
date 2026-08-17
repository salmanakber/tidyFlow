import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, generateToken, isValidEmail, isValidPassword, comparePassword } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { type PlanTier } from '@/lib/subscription';
import { createCustomer } from '@/lib/stripe';
import { getTrialDays } from '@/lib/trial-settings';
import { getAppOrigin } from '@/lib/domains';
import { planSlugToTier } from '@/lib/app-store-links';
import { sendSubscribeWelcomeEmail } from '@/lib/email';
import {
  createPlanCheckoutSession,
  getStripeClientOrThrow,
  mapStripeError,
  resolveCheckoutPrice,
} from '@/lib/stripe-checkout';

export const dynamic = 'force-dynamic';

/**
 * Public register + Stripe Checkout in one step.
 * If checkout fails after the account is created, the same email can resume checkout.
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

    const checkoutEmail = email.toLowerCase().trim();
    const displayName = companyName.trim();
    const existingUser = await prisma.user.findUnique({
      where: { email: checkoutEmail },
      include: { company: { select: { id: true, subscriptionStatus: true, name: true } } },
    });

    const unpaidStatuses = new Set(['unpaid', 'incomplete', 'incomplete_expired', 'canceled', '']);
    const canResume =
      !!existingUser &&
      existingUser.role === UserRole.OWNER &&
      !!existingUser.companyId &&
      unpaidStatuses.has(String(existingUser.company?.subscriptionStatus || ''));

    if (existingUser && !canResume) {
      return NextResponse.json(
        {
          success: false,
          message:
            'An account with this email already exists. Sign in to your customer dashboard to manage billing.',
          code: 'EMAIL_EXISTS',
          loginUrl: '/account/login',
        },
        { status: 409 }
      );
    }

    if (canResume && existingUser) {
      const passwordOk = await comparePassword(password, existingUser.passwordHash);
      if (!passwordOk) {
        return NextResponse.json(
          {
            success: false,
            message:
              'An unfinished account already exists for this email. Sign in (or use Google) to finish checkout.',
            code: 'EMAIL_EXISTS',
            loginUrl: '/account/login',
          },
          { status: 409 }
        );
      }
    }

    const { stripe } = await getStripeClientOrThrow();
    const resolved = await resolveCheckoutPrice({
      stripe,
      tier,
      currency: 'USD',
      useTrial: !!useTrial,
    });

    let result: {
      company: { id: number; name: string };
      user: { id: number; email: string; role: any; firstName: string | null; lastName: string | null };
    };

    if (canResume && existingUser?.companyId) {
      await prisma.company.update({
        where: { id: existingUser.companyId },
        data: { name: displayName, planTier: tier },
      });
      result = {
        company: { id: existingUser.companyId, name: displayName },
        user: existingUser,
      };
    } else {
      const passwordHash = await hashPassword(password);
      result = await prisma.$transaction(async (tx) => {
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
    }

    try {
      let billing = await prisma.billingRecord.findFirst({
        where: { companyId: result.company.id },
        orderBy: { createdAt: 'desc' },
      });

      let customerId = billing?.stripeCustomerId?.trim() || null;
      if (customerId && /^cus_[A-Za-z0-9]+$/.test(customerId)) {
        try {
          const existing = await stripe.customers.retrieve(customerId);
          if ((existing as { deleted?: boolean }).deleted) customerId = null;
        } catch {
          customerId = null;
        }
      } else {
        customerId = null;
      }

      if (!customerId) {
        const customer = await createCustomer(checkoutEmail, displayName, result.company.id, stripe);
        customerId = customer.id;
      }

      if (billing) {
        await prisma.billingRecord.update({
          where: { id: billing.id },
          data: { stripeCustomerId: customerId, status: 'pending_checkout' },
        });
      } else {
        await prisma.billingRecord.create({
          data: {
            companyId: result.company.id,
            stripeCustomerId: customerId,
            status: 'pending_checkout',
            amountDue: 0,
            billingDate: new Date(),
            propertyCount: 0,
          },
        });
      }

      const appOrigin = getAppOrigin();
      const planSlug = tier.toLowerCase();
      const session = await createPlanCheckoutSession({
        stripe,
        customerId,
        companyId: result.company.id,
        tier,
        priceId: resolved.priceId,
        trialDays: resolved.trialDays,
        source: 'public_web_subscribe',
        successUrl: `${appOrigin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}&from=web&plan=${planSlug}`,
        cancelUrl: `${appOrigin}/subscribe/${planSlug}?canceled=1`,
      });

      if (!session.url) {
        return NextResponse.json(
          {
            success: false,
            message: 'Could not start checkout. Sign in to your dashboard to retry.',
            loginUrl: '/account/login',
            code: 'CHECKOUT_FAILED',
          },
          { status: 500 }
        );
      }

      const token = generateToken({
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
        companyId: result.company.id,
        portal: 'customer',
      });

      if (!canResume) {
        const welcomeName =
          [result.user.firstName, result.user.lastName].filter(Boolean).join(' ') || displayName;
        const planLabel =
          tier === 'STARTUP' ? 'Startup' : tier === 'STANDARD' ? 'Standard' : 'Premium';
        void sendSubscribeWelcomeEmail({
          recipientEmail: checkoutEmail,
          recipientName: welcomeName,
          companyName: displayName,
          planLabel,
        }).catch((err) => console.error('Subscribe welcome email failed:', err));
      }

      return NextResponse.json({
        success: true,
        data: {
          url: session.url,
          sessionId: session.id,
          planTier: tier,
          trialDays: resolved.trialDays || (useTrial ? await getTrialDays() : 0),
          token,
          email: checkoutEmail,
        },
      });
    } catch (stripeErr) {
      const mapped = mapStripeError(stripeErr);
      console.error('Public subscribe Stripe error:', stripeErr);
      return NextResponse.json(
        {
          success: false,
          message: `${mapped.message} Your account is saved — sign in at the customer dashboard to retry checkout.`,
          code: mapped.code || 'CHECKOUT_FAILED',
          loginUrl: '/account/login',
        },
        { status: mapped.status || 500 }
      );
    }
  } catch (error) {
    console.error('Public subscribe error:', error);
    const mapped = mapStripeError(error);
    return NextResponse.json(
      { success: false, message: mapped.message || 'Could not start subscription. Please try again.' },
      { status: mapped.status || 500 }
    );
  }
}
