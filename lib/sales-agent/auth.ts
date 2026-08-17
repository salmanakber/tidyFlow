import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveAuthenticatedUser } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';

const ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.DEVELOPER,
  UserRole.OWNER,
  UserRole.ADMIN_UNIQUE,
];

export interface SalesAgentAuth {
  userId: number;
  role: UserRole;
  email?: string;
}

function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/** Admin-only gate for the AI Sales Agent module. Returns auth or a NextResponse error. */
export async function requireSalesAgentAdmin(
  request: NextRequest
): Promise<SalesAgentAuth | NextResponse> {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const user = await resolveAuthenticatedUser(auth.tokenUser);
  if (!user || !user.isActive) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, isHeadSuperAdmin: true } as any,
  });

  const role = ((fullUser as any)?.role || user.role) as UserRole;
  const isHead = !!(fullUser as any)?.isHeadSuperAdmin;
  if (!ADMIN_ROLES.includes(role) && !isHead) {
    return NextResponse.json(
      { success: false, message: 'Admin access required for AI Sales Agent' },
      { status: 403 }
    );
  }

  return {
    userId: user.id,
    role,
    email: user.email,
  };
}

export function isSalesAgentAuth(
  value: SalesAgentAuth | NextResponse
): value is SalesAgentAuth {
  return !isNextResponse(value);
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}
