import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { requireActiveSubscription } from '@/lib/subscription';
import { getCompanyActiveTrackingJobs } from '@/lib/active-tracking';

/** GET /api/tracking/active-jobs — live tasks, cleaners, and recent GPS records */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (!isManagerPlusRole(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const subscriptionCheck = await requireActiveSubscription(auth.tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ success: false, message: subscriptionCheck.message }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const data = await getCompanyActiveTrackingJobs(companyId);
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[tracking/active-jobs]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
