import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const status = request.nextUrl.searchParams.get('status');
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || 50), 100);

  const notifications = await prisma.notification.findMany({
    where: {
      userId: auth.tokenUser.userId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ success: true, data: notifications });
}
