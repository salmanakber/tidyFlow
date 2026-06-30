import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createCustomer, createSubscriptionWithTrial, createSubscriptionInstant, createStripeInstance } from '@/lib/stripe';
import Stripe from 'stripe';
import { getStripeSecretKey, getStripePriceIdForTier } from '@/lib/stripe-settings';

// Initialize Stripe instance (will be created in route handler with proper key)
let stripeInstance: Stripe | null = null;

// Create subscription with 14-day free trial
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Only Company Admin, Owner, or Developer can create subscriptions
  const allowedRoles: UserRole[] = [UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.DEVELOPER, UserRole.SUPER_ADMIN];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    // Get Stripe secret key from SystemSetting with env fallback
    if (!stripeInstance) {
      const secretKey = await getStripeSecretKey();
      if (!secretKey) {
        return NextResponse.json({ 
          success: false, 
          message: 'Stripe secret key not configured. Please configure it in Admin Settings.' 
        }, { status: 500 });
      }
      stripeInstance = createStripeInstance(secretKey);
    }

    const body = await request.json();
    const { 
      companyId, 
      companyName, 
      email, 
      paymentMethodId,
      useTrial = true,
      planTier: requestedTier,
    } = body;

    if (!companyId || !companyName || !email || !paymentMethodId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required fields: companyId, companyName, email, paymentMethodId' 
      }, { status: 400 });
    }

    // Verify company access
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      if (tokenUser.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Not authorized for this company' }, { status: 403 });
      }
    }

    // Get or create company
    let company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    // Get actual property count from database (automatic calculation)
    // Count should be sum of unitCount (each unit counts as a property)
    const properties = await prisma.property.findMany({
      where: { companyId },
      select: { unitCount: true },
    });
    
    // Sum up all unitCount values (each unit = 1 property for billing)
    const propertyCount = properties.reduce((sum, prop) => {
      // @ts-ignore - Field exists in schema but types may not be updated
      return sum + (prop.unitCount || 1);
    }, 0);

    // Plan-based flat monthly pricing (property limits enforced separately)
    const { getPlanLimits } = await import('@/lib/subscription');
    const { getCompanyCurrency } = await import('@/lib/company-config');
    const tier = (requestedTier || company.planTier || 'STANDARD').toUpperCase();
    const limits = await getPlanLimits(tier);
    const billingCurrency = await getCompanyCurrency(companyId);

    if (propertyCount > limits.maxProperties) {
      return NextResponse.json({
        success: false,
        message: `You have ${propertyCount} properties but ${limits.label} allows ${limits.maxProperties}. Upgrade your plan or remove properties.`,
      }, { status: 400 });
    }

    const totalAmount = limits.monthlyPrice;
    const billing = {
      basePrice: totalAmount,
      propertyCount,
      propertyFee: 0,
      totalAmount,
      planTier: tier,
      planLabel: limits.label,
    };

    await prisma.company.update({
      where: { id: companyId },
      data: { planTier: tier, basePrice: totalAmount },
    });
    const existingBilling = await prisma.billingRecord.findFirst({
      where: {
        companyId,
        status: { in: ['active', 'trialing'] },
      },
    });

    if (existingBilling && existingBilling.isTrialPeriod) {
      const trialEndsAt = existingBilling.trialEndsAt;
      if (trialEndsAt && new Date(trialEndsAt) > new Date()) {
        return NextResponse.json({ 
          success: false, 
          message: 'Company already has an active trial period',
          data: { trialEndsAt }
        }, { status: 400 });
      }
    }

    // Check if already has active subscription
    let customerId: string;
    const billingRecord = await prisma.billingRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    if (billingRecord?.stripeCustomerId) {
      customerId = billingRecord.stripeCustomerId;
      // Update customer if needed
      await stripeInstance!.customers.update(customerId, {
        email,
        name: companyName,
        metadata: { companyId: companyId.toString(), preferredCurrency: billingCurrency },
      });
    } else {
      const customer = await createCustomer(email, companyName, companyId, stripeInstance);
      customerId = customer.id;
    }

    await stripeInstance!.customers.update(customerId, {
      metadata: {
        companyId: companyId.toString(),
        preferredCurrency: billingCurrency,
      },
    });

    // Attach payment method to customer
    await stripeInstance!.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripeInstance!.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Stripe price for selected plan tier + company currency
    const basePriceId = await getStripePriceIdForTier(tier, billingCurrency);

    if (!basePriceId) {
      return NextResponse.json({ 
        success: false, 
        message: `Stripe price ID not configured for ${limits.label} (${billingCurrency}). Add it in Admin → Stripe Billing.` 
      }, { status: 500 });
    }

    const propertyPriceId = '';
    const propertyCountForStripe = 0;
    let subscription;
    let trialEndsAt: Date | null = null;
    let isTrialPeriod = false;
    
    if (useTrial) {
      // Create subscription with 14-day trial
      const TRIAL_DAYS = 14;
      subscription = await createSubscriptionWithTrial(
        customerId,
        basePriceId,
        propertyPriceId,
        propertyCountForStripe,
        TRIAL_DAYS,
        stripeInstance
      );
      
      // Calculate trial end date
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
      isTrialPeriod = true;
    } else {
      // Create instant subscription (no trial) - charges immediately
      subscription = await createSubscriptionInstant(
        customerId,
        basePriceId,
        propertyPriceId,
        propertyCountForStripe,
        stripeInstance
      );
      
      // For instant subscription, billing starts immediately
      // Calculate next billing date (typically 1 month from now)
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      trialEndsAt = null;
      isTrialPeriod = false;
    }

    // Extract subscription item IDs from the subscription
    const baseItem = subscription.items.data.find(
      (item) => item.price.id === basePriceId
    );
    const propertyItem = subscription.items.data.find(
      (item) => item.price.id === propertyPriceId
    );

    // Calculate next billing date
    const nextBillingDate = isTrialPeriod 
      ? trialEndsAt 
      : (() => {
          const date = new Date();
          date.setMonth(date.getMonth() + 1);
          return date;
        })();

    // Determine initial payment status
    // For instant subscription, check if invoice was paid
    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | undefined;
    const amountPaid = useTrial ? 0 : (latestInvoice?.amount_paid ? latestInvoice.amount_paid / 100 : 0);
    const amountDue = useTrial ? Number(billing.totalAmount) : (latestInvoice?.amount_due ? latestInvoice.amount_due / 100 : Number(billing.totalAmount));

    // Check payment status for instant subscriptions
    let finalStatus: string;
    if (useTrial) {
      // For trial, status is trialing or active
      finalStatus = subscription.status === 'trialing' ? 'trialing' : 'active';
    } else {
      // For instant subscription, only set to active if payment succeeded
      if (latestInvoice) {
        const invoiceStatus = latestInvoice.status;
        const paymentIntent = latestInvoice.payment_intent;
        
        // Check if payment was successful
        if (invoiceStatus === 'paid' && paymentIntent) {
          const paymentIntentObj = typeof paymentIntent === 'string' 
            ? await stripeInstance!.paymentIntents.retrieve(paymentIntent)
            : paymentIntent;
          
          if (paymentIntentObj.status === 'succeeded') {
            finalStatus = 'active';
          } else {
            // Payment failed or incomplete
            finalStatus = 'incomplete';
          }
        } else if (invoiceStatus === 'paid') {
          finalStatus = 'active';
        } else {
          // Invoice not paid - set to incomplete
          finalStatus = 'incomplete';
        }
      } else {
        // No invoice yet - set to incomplete
        finalStatus = 'incomplete';
      }
    }

    // Create or update billing record
    const billingData: any = {
      companyId,
      stripeCustomerId: customerId,
      subscriptionId: subscription.id,
      status: finalStatus,
      amountPaid,
      amountDue,
      propertyCount,
      trialEndsAt,
      isTrialPeriod,
      billingDate: new Date(),
      nextBillingDate,
    };
    
    // Add subscription item IDs (fields exist in schema but Prisma client needs regeneration)
    if (baseItem?.id) {
      billingData.baseSubscriptionItemId = baseItem.id;
    }
    if (propertyItem?.id) {
      billingData.propertyUsageItemId = propertyItem.id;
    }

    let updatedBilling;
    if (existingBilling) {
      updatedBilling = await prisma.billingRecord.update({
        where: { id: existingBilling.id },
        data: billingData,
      });
    } else {
      updatedBilling = await prisma.billingRecord.create({
        data: billingData,
      });
    }

    // Update company - only set to active if payment succeeded
    await prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: finalStatus,
        trialEndsAt,
        isTrialActive: isTrialPeriod,
        propertyCount,
      },
    });

    // If instant subscription and payment failed, return error
    if (!useTrial && finalStatus === 'incomplete') {
      return NextResponse.json({
        success: false,
        message: 'Payment failed. Please check your payment method and try again.',
        data: {
          subscription: {
            id: subscription.id,
            status: subscription.status,
          },
          billing: updatedBilling,
        },
      }, { status: 402 }); // 402 Payment Required
    }

    return NextResponse.json({
      success: true,
      message: useTrial 
        ? 'Subscription created with 14-day free trial'
        : 'Subscription created and activated immediately',
      data: {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        },
        billing: updatedBilling,
        trialEndsAt: trialEndsAt?.toISOString() || null,
        isTrialPeriod,
      },
    });
  } catch (error: any) {
    console.error('Subscription creation error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to create subscription' 
    }, { status: 500 });
  }
}

