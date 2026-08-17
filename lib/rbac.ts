import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { getUserFromRequest, JWTPayload } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getTrialDays } from '@/lib/trial-settings';

// Define role hierarchy from lowest to highest privileges
const ROLE_ORDER: UserRole[] = [
  UserRole.CLEANER,
  UserRole.MANAGER,
  UserRole.COMPANY_ADMIN,
  UserRole.DEVELOPER,
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
];

const GLOBAL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.DEVELOPER,
];

/** Roles that can manage company resources (properties, payroll, safety logs, etc.). */
export const MANAGER_PLUS_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.DEVELOPER,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
];

export function isManagerPlusRole(role: UserRole | string): boolean {
  return MANAGER_PLUS_ROLES.includes(role as UserRole);
}

const COMPANY_BILLING_ROLES = new Set([
  'OWNER',
  'COMPANY_ADMIN',
  'SUPER_ADMIN',
  'DEVELOPER',
  'ADMIN_UNIQUE',
]);

export function isCompanyBillingRole(role: unknown): boolean {
  return COMPANY_BILLING_ROLES.has(String(role || '').toUpperCase().trim());
}

export async function ensureCustomerOwnsCompany(userId: number) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const select = {
    id: true,
    email: true,
    role: true,
    companyId: true,
    isActive: true,
    firstName: true,
    lastName: true,
  } as const;

  let user = await prisma.user.findUnique({ where: { id }, select });
  if (!user?.isActive) return null;

  if (!user.companyId) {
    const trialDays = await getTrialDays();
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    const companyName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email.split('@')[0] || 'My company';
    const company = await prisma.company.create({
      data: {
        name: companyName,
        planTier: 'STARTUP',
        subscriptionStatus: 'unpaid',
        isTrialActive: trialDays > 0,
        trialEndsAt: trialDays > 0 ? trialEndsAt : null,
      },
    });
    user = await prisma.user.update({
      where: { id: user.id },
      data: { companyId: company.id, role: 'OWNER' },
      select,
    });
  } else if (!isCompanyBillingRole(user.role)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'OWNER' },
      select,
    });
  }

  return user;
}

/**
 * Company owner/admin access for customer billing, checkout, and payment portal.
 * Uses the live user record (not only the token) so a new owner can manage their plan.
 */
export async function requireCompanyBillingAccess(request: NextRequest): Promise<
  | { tokenUser: JWTPayload; companyId: number; response: null }
  | { tokenUser: null; companyId: null; response: NextResponse }
> {
  const denied = (message: string, status: number) => ({
    tokenUser: null as null,
    companyId: null as null,
    response: NextResponse.json({ success: false, message }, { status }),
  });

  const auth = requireAuth(request);
  if (!auth) return denied('Please sign in to continue.', 401);

  const actor = await ensureCustomerOwnsCompany(Number(auth.tokenUser.userId));
  const resolved =
    actor ||
    (await (async () => {
      const fallback = await resolveAuthenticatedUser(auth.tokenUser);
      return fallback ? ensureCustomerOwnsCompany(fallback.id) : null;
    })());
  if (!resolved) return denied('Please sign in to continue.', 401);

  // Customer dashboard: the signed-in user manages billing for their own company.
  if (resolved.companyId && !isCompanyBillingRole(resolved.role)) {
    const promoted = await prisma.user.update({
      where: { id: resolved.id },
      data: { role: 'OWNER' },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        isActive: true,
        firstName: true,
        lastName: true,
      },
    });
    Object.assign(resolved, promoted);
  }

  if (!resolved.companyId) {
    return denied('No company is linked to this account yet.', 400);
  }

  const tokenUser: JWTPayload = {
    ...auth.tokenUser,
    userId: resolved.id,
    email: resolved.email,
    role: resolved.role,
    companyId: resolved.companyId,
  };

  const privileged = ['SUPER_ADMIN', 'DEVELOPER', 'ADMIN_UNIQUE'].includes(
    String(resolved.role || '').toUpperCase()
  );
  const companyId = privileged
    ? (await resolveCompanyIdAsync(request, tokenUser)) || resolved.companyId
    : resolved.companyId;
  if (!companyId) {
    return denied('No company is linked to this account yet.', 400);
  }

  return { tokenUser, companyId, response: null };
}

export function hasAtLeastRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(minRole);
}

export function hasOneOfRoles(role: UserRole | string, allowed: readonly UserRole[]): boolean {
  return allowed.includes(role as UserRole);
}

export interface AuthContext {
  tokenUser: JWTPayload;
}

// Extract and verify JWT from request
export function requireAuth(request: NextRequest): AuthContext | null {
  const tokenUser = getUserFromRequest(request);
  if (!tokenUser) return null;
  return { tokenUser };
}

/** Resolve JWT user to a live User row (handles stale userId after DB restore/re-import). */
export async function resolveAuthenticatedUser(tokenUser: JWTPayload) {
  const tokenUserId = Number(tokenUser.userId);
  const userSelect = {
    id: true,
    companyId: true,
    isActive: true,
    email: true,
    role: true,
  } as const;

  let actor =
    Number.isFinite(tokenUserId) && tokenUserId > 0
      ? await prisma.user.findUnique({
          where: { id: tokenUserId },
          select: userSelect,
        })
      : null;

  if ((!actor || !actor.isActive) && tokenUser.email) {
    actor = await prisma.user.findFirst({
      where: {
        email: { equals: tokenUser.email, mode: 'insensitive' },
        isActive: true,
      },
      select: userSelect,
    });
  }

  return actor?.isActive ? actor : null;
}

export function requireRole(tokenUser: JWTPayload, minRole: UserRole): boolean {
  try {
    const role = (tokenUser.role as UserRole) || UserRole.CLEANER;
    return hasAtLeastRole(role, minRole);
  } catch {
    return false;
  }
}

// Token-only company id (null for SUPER_ADMIN / OWNER / DEVELOPER without company in JWT)
export function requireCompanyScope(tokenUser: JWTPayload): number | null {
  return tokenUser.companyId ?? null;
}

/**
 * Resolve which company a request targets.
 * - MANAGER / COMPANY_ADMIN / CLEANER: always token companyId (userId is NOT companyId)
 * - SUPER_ADMIN / OWNER / DEVELOPER: ?companyId= query, X-Company-Id header, then token fallback
 */
export function resolveCompanyId(request: NextRequest, tokenUser: JWTPayload): number | null {
  const role = tokenUser.role as UserRole;

  if (!GLOBAL_ROLES.includes(role)) {
    return tokenUser.companyId ?? null;
  }

  const { searchParams } = new URL(request.url);
  const fromQuery = searchParams.get('companyId');
  const fromHeader = request.headers.get('x-company-id');

  const candidates = [
    fromQuery ? parseInt(fromQuery, 10) : NaN,
    fromHeader ? parseInt(fromHeader, 10) : NaN,
    tokenUser.companyId,
  ].filter((id): id is number => typeof id === 'number' && !Number.isNaN(id));

  for (const companyId of candidates) {
    if (canAccessCompany(tokenUser, companyId)) return companyId;
  }

  return null;
}

/**
 * Like resolveCompanyId but falls back to the user's companyId in the database
 * (needed for OWNER/MANAGER mobile tokens that omit companyId in JWT).
 */
export async function resolveCompanyIdAsync(
  request: NextRequest,
  tokenUser: JWTPayload
): Promise<number | null> {
  const fromRequest = resolveCompanyId(request, tokenUser);
  if (fromRequest) return fromRequest;

  const user = await prisma.user.findUnique({
    where: { id: Number(tokenUser.userId) },
    select: { companyId: true },
  });

  if (!user?.companyId) return null;

  const role = tokenUser.role as UserRole;
  if (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.OWNER ||
    role === UserRole.DEVELOPER
  ) {
    return user.companyId;
  }

  // Company-scoped roles: JWT may omit companyId — trust the user's DB record.
  if (tokenUser.companyId == null || tokenUser.companyId === user.companyId) {
    return user.companyId;
  }

  return null;
}

// Utility to check if the token user can act on a given company resource
export function canAccessCompany(tokenUser: JWTPayload, companyId: number): boolean {
  const role = tokenUser.role as UserRole;
  // Global roles can access all companies
  if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) return true;
  // Otherwise must match their own company
  return tokenUser.companyId === companyId;
}
