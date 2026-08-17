import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';

/** Per-type photo upload cap for tasks (before / after each have this max). */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const config = await prisma.adminConfiguration.findUnique({
    where: { companyId },
    select: { photoCountRequirement: true, watermarkEnabled: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      photoCountRequirement: config?.photoCountRequirement ?? 20,
      watermarkEnabled: config?.watermarkEnabled ?? false,
      companyId,
    },
  });
}
