import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, generateToken, isValidEmail, isValidPassword } from '@/lib/auth';
import { sendSubscribeWelcomeEmail } from '@/lib/email';
import { attributeCompanyToPartner, findPartnerByReferralCode } from '@/lib/partners';
import { getTrialDays } from '@/lib/trial-settings';

/**
 * POST /api/auth/register
 * Register a new user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, firstName, lastName, companyName, referralCode } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json({
        success: false,
        message: 'Email and password are required'
      }, { status: 400 });
    }

    // Company name is required for registration (no standalone users)
    if (!companyName || companyName.trim() === '') {
      return NextResponse.json({
        success: false,
        message: 'Company name is required for registration'
      }, { status: 400 });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid email format'
      }, { status: 400 });
    }

    // Validate password strength
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({
        success: false,
        message: passwordValidation.message
      }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return NextResponse.json({
        success: false,
        message: 'User with this email already exists'
      }, { status: 409 });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Customer / self-serve signup is always the company owner so they can manage billing.
    const userRole = 'OWNER' as const;

    // Create company with backend free trial (same model as Stripe trialing accounts)
    const trialDays = await getTrialDays();
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    const company = await prisma.company.create({
      data: {
        name: companyName.trim(),
        subscriptionStatus: 'trialing',
        isTrialActive: true,
        trialEndsAt,
        planTier: 'STANDARD',
      }
    });

    // Create new user with company
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role: userRole,
        companyId: company.id
      }
    });

    // Attribute to marketing partner when ?ref= / referralCode present
    try {
      const partner = await findPartnerByReferralCode(referralCode);
      if (partner) {
        await attributeCompanyToPartner({
          partnerId: partner.id,
          companyId: company.id,
          userId: user.id,
          registeredEmail: user.email,
          companyName: company.name,
        });
      }
    } catch (attrErr) {
      console.error('Partner attribution failed:', attrErr);
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId || undefined,
      portal: body.portal === 'admin' ? 'admin' : 'customer',
    });

    const welcomeName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || company.name;
    void sendSubscribeWelcomeEmail({
      recipientEmail: user.email,
      recipientName: welcomeName,
      companyName: company.name,
    }).catch((err) => console.error('Register welcome email failed:', err));

    return NextResponse.json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId
        }
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
