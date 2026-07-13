import { type NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/** Company-scoped audit log feed for mobile compliance screen */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  const entityType = searchParams.get('entityType');
  const limit = Math.min(Number(searchParams.get('limit') || 50), 500);
  const format = searchParams.get('format');

  const where: {
    companyId: number;
    action?: string;
    entityType?: string;
  } = { companyId };

  if (action) where.action = action;
  if (entityType) where.entityType = entityType;

  const auditLogs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const formattedLogs = auditLogs.map((log) => ({
    id: log.id,
    companyId: log.companyId,
    userId: log.userId,
    user: log.user
      ? {
          id: log.user.id,
          firstName: log.user.firstName,
          lastName: log.user.lastName,
          email: log.user.email,
        }
      : null,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    oldValues: log.oldValues ? safeJsonParse(log.oldValues) : null,
    newValues: log.newValues ? safeJsonParse(log.newValues) : null,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
  }));

  if (format === 'csv') {
    const header = 'Date,User,Action,Entity Type,Entity ID\n';
    const rows = formattedLogs
      .map((log) => {
        const userName = log.user
          ? [log.user.firstName, log.user.lastName].filter(Boolean).join(' ') || log.user.email
          : 'System';
        const date = new Date(log.createdAt).toISOString();
        return `"${date}","${escapeCsv(userName)}","${escapeCsv(log.action)}","${escapeCsv(log.entityType)}","${escapeCsv(log.entityId || '')}"`;
      })
      .join('\n');

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="audit-trail.csv"',
      },
    });
  }

  return NextResponse.json({ success: true, data: formattedLogs });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function escapeCsv(value: string) {
  return value.replace(/"/g, '""');
}
