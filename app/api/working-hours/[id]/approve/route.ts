import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { approveWorkingHoursSubmission } from '@/lib/task-time-log';
import { createNotification } from '@/lib/notifications';

// POST /api/working-hours/[id]/approve
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (
    role !== UserRole.OWNER &&
    role !== UserRole.DEVELOPER &&
    role !== UserRole.COMPANY_ADMIN &&
    role !== UserRole.MANAGER
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const submissionId = Number(params.id);
  if (Number.isNaN(submissionId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  try {
    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const body = await request.json();
    const action = (body.action as 'approve' | 'reject') || 'approve';

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    }

    const updated = await approveWorkingHoursSubmission({
      submissionId,
      companyId,
      approvedBy: tokenUser.userId,
      action,
    });

    if (action === 'approve') {
      await createNotification({
        userId: updated.userId,
        title: 'Hours Approved',
        message: `Your logged hours (${Number(updated.hours).toFixed(2)}h) have been approved and are ready for payroll.`,
        type: 'task_update',
        metadata: { submissionId: updated.id },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'Hours approved' : 'Hours rejected',
      data: {
        id: updated.id,
        status: updated.status,
        hours: Number(updated.hours),
        approvedAt: updated.approvedAt?.toISOString() ?? null,
      },
    });
  } catch (error: any) {
    console.error('[working-hours/approve]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 400 }
    );
  }
}
