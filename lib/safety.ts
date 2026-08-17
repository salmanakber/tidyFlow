import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { sendSMS } from '@/lib/sms';

export async function triggerSOSAlert(params: {
  userId: number;
  companyId: number;
  latitude: number;
  longitude: number;
  taskId?: number;
}) {
  const alert = await prisma.sOSAlert.create({
    data: {
      userId: params.userId,
      companyId: params.companyId,
      taskId: params.taskId,
      latitude: params.latitude,
      longitude: params.longitude,
      status: 'active',
    },
  });

  const cleaner = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { firstName: true, lastName: true, phone: true },
  });

  const cleanerName =
    `${cleaner?.firstName || ''} ${cleaner?.lastName || ''}`.trim() || 'Cleaner';

  const managers = await prisma.user.findMany({
    where: {
      companyId: params.companyId,
      role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
      isActive: true,
    },
    select: { id: true, phone: true },
  });

  const mapsUrl = `https://maps.google.com/?q=${params.latitude},${params.longitude}`;
  const message = `🚨 SOS ALERT: ${cleanerName} needs immediate assistance. Location: ${mapsUrl}`;

  for (const manager of managers) {
    await createNotification({
      userId: manager.id,
      title: '🚨 SOS Emergency Alert',
      message: `${cleanerName} triggered an SOS alert. Tap to view location.`,
      type: 'high_severity_issue',
      metadata: {
        sosAlertId: alert.id,
        latitude: params.latitude,
        longitude: params.longitude,
        taskId: params.taskId,
      },
      screenRoute: 'MapView',
    });

    if (manager.phone) {
      await sendSMS({ to: manager.phone, message });
    }
  }

  return alert;
}
