import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getCleanerHoursSummary } from '@/lib/task-time-log';

// GET /api/working-hours/summary
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const companyId = requireCompanyScope(tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const role = tokenUser.role as UserRole;

    let targetUserId = tokenUser.userId;
    if (userIdParam) {
      if (
        role !== UserRole.OWNER &&
        role !== UserRole.DEVELOPER &&
        role !== UserRole.COMPANY_ADMIN &&
        role !== UserRole.MANAGER
      ) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      targetUserId = Number(userIdParam);
    }

    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const summary = await getCleanerHoursSummary(targetUserId, companyId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('[working-hours/summary]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
