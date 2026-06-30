import { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';
import { getUserFromRequest, JWTPayload } from '@/lib/auth';
import prisma from '@/lib/prisma';

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

export function hasOneOfRoles(role: UserRole | string, allowed: readonly UserRole[]): boolean {
  return allowed.includes(role as UserRole);
}

export function hasAtLeastRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(minRole);
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
    where: { id: tokenUser.userId },
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
