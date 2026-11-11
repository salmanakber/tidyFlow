import { type NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { humanizeAuditAction } from '@/lib/audit-labels';
import { UserRole, Prisma } from '@prisma/client';

/** Company-scoped audit log feed for compliance (mobile + web). */
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
  const action = searchParams.get('action')?.trim() || '';
  const entityType = searchParams.get('entityType')?.trim() || '';
  const userIdRaw = searchParams.get('userId');
  const search = searchParams.get('search')?.trim() || '';
  const dateFrom = searchParams.get('dateFrom') || searchParams.get('from') || '';
  const dateTo = searchParams.get('dateTo') || searchParams.get('to') || '';
  const rawLimit = Number(searchParams.get('limit') || 20);
  const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 500);
  const format = searchParams.get('format');

  const where: Prisma.AuditLogWhereInput = { companyId };

  if (action) where.action = { contains: action };
  if (entityType) where.entityType = entityType;
  if (userIdRaw && !Number.isNaN(Number(userIdRaw))) {
    where.userId = Number(userIdRaw);
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!Number.isNaN(from.getTime())) where.createdAt.gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!Number.isNaN(to.getTime())) {
        // Inclusive end-of-day when only a date is provided
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
          to.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = to;
      }
    }
  }

  if (search) {
    where.OR = [
      { action: { contains: search } },
      { entityType: { contains: search } },
      { entityId: { contains: search } },
      {
        user: {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
          ],
        },
      },
    ];
  }

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
    actionLabel: humanizeAuditAction(log.action),
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
        const date = new Date(log.createdAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        return `"${escapeCsv(date)}","${escapeCsv(userName)}","${escapeCsv(log.actionLabel)}","${escapeCsv(log.entityType)}","${escapeCsv(log.entityId || '')}"`;
      })
      .join('\n');

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tidyflow-audit-trail.csv"',
      },
    });
  }

  if (format === 'html' || format === 'pdf') {
    const generatedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const rowsHtml = formattedLogs
      .map((log) => {
        const userName = log.user
          ? [log.user.firstName, log.user.lastName].filter(Boolean).join(' ') || log.user.email
          : 'System';
        const date = new Date(log.createdAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        return `<tr>
          <td>${escapeHtml(date)}</td>
          <td>${escapeHtml(userName || '')}</td>
          <td>${escapeHtml(log.actionLabel)}</td>
          <td>${escapeHtml(log.entityType)}${log.entityId ? ` #${escapeHtml(String(log.entityId))}` : ''}</td>
        </tr>`;
      })
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>TidyFlow Audit Trail</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 8px; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; color: #64748b; }
    td { border-bottom: 1px solid #e2e8f0; padding: 8px; vertical-align: top; }
    .brand { color: #b45309; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <div class="brand">TidyFlow Compliance</div>
  <h1>Audit Trail Report</h1>
  <p class="meta">Generated ${escapeHtml(generatedAt)} · ${formattedLogs.length} event(s)</p>
  <table>
    <thead><tr><th>Date</th><th>User</th><th>Action</th><th>Entity</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="4">No audit events</td></tr>'}</tbody>
  </table>
  <script>window.onload = function () { if (location.search.includes('autoprint=1') || location.search.includes('format=pdf')) setTimeout(function(){ window.print(); }, 250); };</script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': format === 'pdf'
          ? 'inline; filename="tidyflow-audit-trail.html"'
          : 'inline; filename="tidyflow-audit-trail.html"',
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

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
