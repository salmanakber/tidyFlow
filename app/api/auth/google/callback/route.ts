import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { generateToken, hashPassword } from '@/lib/auth';
import { getAppOrigin } from '@/lib/domains';
import {
  exchangeGoogleCode,
  isGoogleOAuthConfigured,
  verifyGoogleOauthState,
} from '@/lib/google-oauth';
import { planSlugToTier } from '@/lib/app-store-links';
import { unpaidCompanyCreateData } from '@/lib/unpaid-company';

export const dynamic = 'force-dynamic';

function failRedirect(path: string, message: string) {
  const origin = getAppOrigin();
  const url = new URL(path, origin);
  url.searchParams.set('error', message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return failRedirect('/account/login', 'Google sign-in is not configured.');
  }

  const code = request.nextUrl.searchParams.get('code');
  const stateRaw = request.nextUrl.searchParams.get('state');
  const oauthError = request.nextUrl.searchParams.get('error');
  if (oauthError) {
    return failRedirect('/account/login', 'Google sign-in was cancelled.');
  }
  if (!code || !stateRaw) {
    return failRedirect('/account/login', 'Google sign-in was incomplete.');
  }

  const state = verifyGoogleOauthState(stateRaw);
  if (!state) {
    return failRedirect('/account/login', 'Google sign-in expired. Please try again.');
  }

  try {
    const profile = await exchangeGoogleCode(code);

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: profile.googleId }, { email: profile.email }],
      },
    });

    if (!user) {
      if (state.portal === 'admin') {
        return failRedirect('/login', 'No TidyFlow admin account exists for this Google email.');
      }

      const companyName =
        state.companyName?.trim() ||
        [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
        profile.email.split('@')[0];
      const passwordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));

      const created = await prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: unpaidCompanyCreateData(companyName),
        });
        const createdUser = await tx.user.create({
          data: {
            email: profile.email,
            passwordHash,
            googleId: profile.googleId,
            firstName: profile.firstName || null,
            lastName: profile.lastName || null,
            profileImage: profile.picture || null,
            role: 'OWNER',
            companyId: company.id,
          },
        });
        return createdUser;
      });
      user = created;
    } else {
      if (!user.isActive) {
        return failRedirect(
          state.portal === 'admin' ? '/login' : '/account/login',
          'Account is disabled. Please contact support.'
        );
      }
      const patch: Record<string, unknown> = {};
      if (!user.googleId) patch.googleId = profile.googleId;
      if (profile.picture && !user.profileImage) patch.profileImage = profile.picture;
      if (profile.firstName && !user.firstName) patch.firstName = profile.firstName;
      if (profile.lastName && !user.lastName) patch.lastName = profile.lastName;

      if (state.portal === 'customer') {
        if (!user.companyId) {
          const companyName =
            state.companyName?.trim() ||
            [profile.firstName || user.firstName, profile.lastName || user.lastName]
              .filter(Boolean)
              .join(' ') ||
            profile.email.split('@')[0];
          const company = await prisma.company.create({
            data: unpaidCompanyCreateData(companyName),
          });
          patch.companyId = company.id;
          patch.role = 'OWNER';
        } else if (!['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'DEVELOPER', 'ADMIN_UNIQUE'].includes(String(user.role))) {
          patch.role = 'OWNER';
        }
      }

      if (Object.keys(patch).length) {
        user = await prisma.user.update({ where: { id: user.id }, data: patch });
      }
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId || undefined,
      portal: state.portal,
    });

    const origin = getAppOrigin();
    const nextPath =
      state.portal === 'admin'
        ? '/admin/dashboard'
        : state.next || '/account/billing';

    const callback = new URL('/account/google-callback', origin);
    callback.searchParams.set('token', token);
    callback.searchParams.set('portal', state.portal);
    callback.searchParams.set('next', nextPath);
    callback.searchParams.set('email', user.email);
    if (state.plan) {
      const tier = planSlugToTier(state.plan) || state.plan.toUpperCase();
      callback.searchParams.set('pay', String(tier));
      if (state.useTrial) callback.searchParams.set('trial', '1');
    }

    const res = NextResponse.redirect(callback);
    if (state.portal !== 'admin') {
      res.cookies.set('authToken', '', { path: '/', maxAge: 0 });
    }
    return res;
  } catch (error: any) {
    console.error('Google OAuth callback error:', error);
    return failRedirect(
      state.portal === 'admin' ? '/login' : '/account/login',
      error?.message || 'Google sign-in failed.'
    );
  }
}
