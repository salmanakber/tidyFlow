import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = Math.min(200, parseInt(sp.get('pageSize') || '50', 10));
  const category = sp.get('category');
  const level = sp.get('level');
  const search = sp.get('search');
  const format = sp.get('format'); // csv

  const where: Record<string, any> = {};
  if (category) where.category = category;
  if (level) where.level = level;
  if (search) {
    where.OR = [
      { message: { contains: search, mode: 'insensitive' } },
      { action: { contains: search, mode: 'insensitive' } },
      { details: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (format === 'csv') {
    const rows = await (prisma as any).saSystemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const header = 'id,createdAt,level,category,action,message,success,entityType,entityId,durationMs\n';
    const lines = rows
      .map((r: any) =>
        [
          r.id,
          r.createdAt.toISOString(),
          r.level,
          r.category,
          r.action,
          JSON.stringify(r.message),
          r.success,
          r.entityType || '',
          r.entityId || '',
          r.durationMs ?? '',
        ].join(',')
      )
      .join('\n');
    return new NextResponse(header + lines, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="sales-agent-logs-${Date.now()}.csv"`,
      },
    });
  }

  const [total, items] = await Promise.all([
    (prisma as any).saSystemLog.count({ where }),
    (prisma as any).saSystemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return jsonOk({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();

  if (body.action === 'bulk_delete' && Array.isArray(body.ids)) {
    const ids = body.ids.map(Number).filter(Boolean);
    if (!ids.length) return jsonError('ids required');
    const result = await (prisma as any).saSystemLog.deleteMany({ where: { id: { in: ids } } });
    return jsonOk({ deleted: result.count });
  }

  if (body.action === 'clear') {
    const where: Record<string, any> = {};
    if (body.category) where.category = body.category;
    if (body.level) where.level = body.level;
    const result = await (prisma as any).saSystemLog.deleteMany({ where });
    return jsonOk({ deleted: result.count });
  }

  return jsonError('Unknown action');
}

export async function DELETE(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!id) return jsonError('id is required');

  const existing = await (prisma as any).saSystemLog.findUnique({ where: { id } });
  if (!existing) return jsonError('Log not found', 404);

  await (prisma as any).saSystemLog.delete({ where: { id } });
  return jsonOk({ deleted: true, id });
}
