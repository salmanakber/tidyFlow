import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { expoPushToken, fcmToken, platform, deviceId } = body;

  if (!expoPushToken && !fcmToken) {
    return NextResponse.json({ success: false, message: 'Token required' }, { status: 400 });
  }

  const userId = auth.tokenUser.userId;

  if (expoPushToken) {
    await prisma.deviceToken.upsert({
      where: { userId_expoPushToken: { userId, expoPushToken } },
      create: { userId, expoPushToken, fcmToken, platform, deviceId, isActive: true },
      update: { isActive: true, platform, deviceId },
    });
  } else if (fcmToken) {
    await prisma.deviceToken.upsert({
      where: { userId_fcmToken: { userId, fcmToken } },
      create: { userId, fcmToken, platform, deviceId, isActive: true },
      update: { isActive: true, platform, deviceId },
    });
  }

  return NextResponse.json({ success: true });
}
