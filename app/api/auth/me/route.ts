import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getUserFromRequest, hashPassword, comparePassword } from '../../../../lib/auth';
import { isStrongPassword } from '@/lib/password-policy';
import { getCompanyInvoiceSettings } from '@/lib/invoice-settings';
import { buildCompanySlug } from '@/lib/company-slug';

/**
 * GET /api/auth/me
 * Get current user profile
 */
export async function GET(request: NextRequest) {
  try {
    // Get user from token
    const tokenUser = getUserFromRequest(request);
    if (!tokenUser) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized - Invalid or missing token'
      }, { status: 401 });
    }

    // Fetch user details from database
    const user = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profileImage: true,
        role: true,
        companyId: true,
        isActive: true,
        isHeadSuperAdmin: true,
        createdAt: true,
        googleId: true,
        company: {
          select: {
            id: true,
            name: true,
            planTier: true,
            subscriptionStatus: true,
            isTrialActive: true,
            trialEndsAt: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'User not found'
      }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({
        success: false,
        message: 'Account is disabled'
      }, { status: 403 });
    }

    const invoice = user.companyId ? await getCompanyInvoiceSettings(user.companyId) : null;
    const personName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim().toLowerCase();
    const emailLocal = user.email.split('@')[0].toLowerCase().replace(/[._-]/g, '');
    const companyName = (user.company?.name || '').trim();
    const companyKey = companyName.toLowerCase().replace(/[._-]/g, '');
    const placeholderCompanyName =
      !companyName ||
      (personName.length > 0 && companyName.toLowerCase() === personName) ||
      (emailLocal.length > 0 && companyKey === emailLocal);

    const createdMs = user.createdAt ? new Date(user.createdAt).getTime() : 0;
    const isNewAccount = Number.isFinite(createdMs) && Date.now() - createdMs < 30 * 24 * 60 * 60 * 1000;

    const unpaid =
      !user.company ||
      ['unpaid', 'incomplete', 'incomplete_expired', 'canceled', ''].includes(
        String(user.company.subscriptionStatus || '').toLowerCase()
      );
    const hasAssignedPlan = ['STARTUP', 'STANDARD', 'PREMIUM'].includes(
      String(user.company?.planTier || '').toUpperCase()
    );
    const needsPlan = unpaid || !hasAssignedPlan;
    const requireCompanyDetails = isNewAccount || unpaid;

    const missingSetup: string[] = [];
    if (!user.firstName?.trim()) missingSetup.push('firstName');
    if (!user.lastName?.trim()) missingSetup.push('lastName');
    if (placeholderCompanyName) missingSetup.push('companyName');
    if (requireCompanyDetails && !invoice?.companyDisplayName?.trim()) missingSetup.push('companyDisplayName');
    if (requireCompanyDetails && !invoice?.address?.trim()) missingSetup.push('address');
    if (requireCompanyDetails && !invoice?.phone?.trim()) missingSetup.push('companyPhone');
    if (requireCompanyDetails && !invoice?.email?.trim()) missingSetup.push('companyEmail');

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          profileImage: user.profileImage,
          role: user.role,
          companyId: user.companyId,
          isHeadSuperAdmin: user.isHeadSuperAdmin,
          createdAt: user.createdAt,
          hasGoogle: !!user.googleId,
        },
        company: user.company
          ? {
              id: user.companyId,
              name: user.company.name,
              planTier: user.company.planTier,
              subscriptionStatus: user.company.subscriptionStatus,
              isTrialActive: user.company.isTrialActive,
              trialEndsAt: user.company.trialEndsAt,
              slug: user.companyId
                ? buildCompanySlug({ id: user.companyId, name: user.company.name })
                : null,
            }
          : null,
        needsOnboarding: missingSetup.length > 0,
        missingSetup,
        placeholderCompanyName,
        needsPlan,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * PATCH /api/auth/me
 * Update current user profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const tokenUser = getUserFromRequest(request);
    if (!tokenUser) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized - Invalid or missing token'
      }, { status: 401 });
    }

    const body = await request.json();
    const { firstName, lastName, phone, currentPassword, newPassword, profileImage } = body;

    const existing = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { passwordHash: true, googleId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const updateData: any = {};

    if (firstName !== undefined && firstName !== null) updateData.firstName = firstName.trim();
    if (lastName !== undefined && lastName !== null) updateData.lastName = lastName.trim();
    if (phone !== undefined) {
      // Allow empty string to clear phone number
      updateData.phone = phone === '' ? null : (phone ? phone.trim() : null);
    }
    if (profileImage !== undefined) updateData.profileImage = profileImage || null;

    // Handle password change
    if (newPassword) {
      const strength = isStrongPassword(newPassword);
      if (!strength.valid) {
        return NextResponse.json({
          success: false,
          message: strength.message || 'Please choose a stronger password',
        }, { status: 400 });
      }

      const googleWithoutCurrent = !!existing.googleId && !currentPassword;
      if (!googleWithoutCurrent) {
        if (!currentPassword) {
          return NextResponse.json({
            success: false,
            message: 'Current password is required to change password',
          }, { status: 400 });
        }
        const isPasswordValid = await comparePassword(currentPassword, existing.passwordHash);
        if (!isPasswordValid) {
          return NextResponse.json({
            success: false,
            message: 'Current password is incorrect',
          }, { status: 401 });
        }
      }

      updateData.passwordHash = await hashPassword(newPassword);
    }

    const updatedUser = await prisma.user.update({
      where: { id: tokenUser.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        companyId: true,
        profileImage: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { user: updatedUser }
    }, { status: 200 });

  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
