import { NextRequest, NextResponse } from 'next/server';
import {
  listClientClaims,
  requirePartnersAdmin,
  reviewClientClaim,
} from '@/lib/partners';

/** GET /api/admin/partners/claims?status=PENDING|APPROVED|REJECTED|ALL */
export async function GET(request: NextRequest) {
  const auth = requirePartnersAdmin(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const status = request.nextUrl.searchParams.get('status') || 'PENDING';
  const claims = await listClientClaims({ status });
  return NextResponse.json({ success: true, data: claims });
}

/** POST /api/admin/partners/claims — { claimId, approve, adminNote? } */
export async function POST(request: NextRequest) {
  const auth = requirePartnersAdmin(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const claimId = Number(body.claimId);
  if (!claimId) {
    return NextResponse.json({ success: false, message: 'claimId required' }, { status: 400 });
  }

  const result = await reviewClientClaim({
    claimId,
    approve: Boolean(body.approve),
    adminNote: body.adminNote ? String(body.adminNote) : undefined,
    reviewedByUserId: Number(auth.tokenUser?.userId) || undefined,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: result.message, data: result.claim });
}
