import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { buildLeadWhere, parseLeadFiltersFromSearchParams } from '@/lib/sales-agent/leads';
import { enqueueBulkAnalyze } from '@/lib/sales-agent/queue';
import { saLog } from '@/lib/sales-agent/logger';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(sp.get('pageSize') || '25', 10)));
  const sortBy = sp.get('sortBy') || 'createdAt';
  const sortDir = sp.get('sortDir') === 'asc' ? 'asc' : 'desc';
  const filters = parseLeadFiltersFromSearchParams(sp);
  const where = buildLeadWhere(filters);

  const allowedSort = new Set([
    'createdAt',
    'name',
    'leadScore',
    'googleRating',
    'reviewCount',
    'city',
    'status',
    'lastContactedAt',
  ]);
  const orderBy = { [allowedSort.has(sortBy) ? sortBy : 'createdAt']: sortDir };

  const [total, items] = await Promise.all([
    (prisma as any).saLeadCompany.count({ where }),
    (prisma as any).saLeadCompany.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
        contacts: { take: 3 },
        groupMembers: { include: { group: { select: { id: true, label: true, method: true } } } },
        _count: { select: { sentEmails: true, replies: true } },
      },
    }),
  ]);

  // Replied / converted leads float to top within the page when default sort
  const sorted =
    sortBy === 'createdAt'
      ? [...items].sort((a: any, b: any) => {
          const ap = a.status === 'REPLIED' || a.status === 'CONVERTED' || (a._count?.replies || 0) > 0 ? 1 : 0;
          const bp = b.status === 'REPLIED' || b.status === 'CONVERTED' || (b._count?.replies || 0) > 0 ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return 0;
        })
      : items;

  return jsonOk({ items: sorted, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  if (body.action === 'bulk_analyze' && Array.isArray(body.ids)) {
    await enqueueBulkAnalyze(body.ids.map(Number));
    await saLog({
      category: 'user',
      action: 'bulk_analyze',
      message: `Queued analyze for ${body.ids.length} leads`,
      userId: gate.userId,
    });
    return jsonOk({ queued: body.ids.length });
  }

  if (body.action === 'bulk_delete' && Array.isArray(body.ids)) {
    const ids = body.ids.map(Number).filter(Boolean);
    const result = await (prisma as any).saLeadCompany.deleteMany({ where: { id: { in: ids } } });
    await saLog({
      category: 'user',
      action: 'bulk_delete_leads',
      message: `Deleted ${result.count} leads`,
      userId: gate.userId,
    });
    return jsonOk({ deleted: result.count });
  }

  if (body.action === 'bulk_status' && Array.isArray(body.ids) && body.status) {
    await (prisma as any).saLeadCompany.updateMany({
      where: { id: { in: body.ids.map(Number) } },
      data: { status: body.status },
    });
    return jsonOk({ updated: body.ids.length });
  }

  // Manual lead create
  if (!body.name) return jsonError('name is required');
  const lead = await (prisma as any).saLeadCompany.create({
    data: {
      name: body.name,
      website: body.website || null,
      websiteNormalized: body.website
        ? body.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
        : null,
      email: body.email || null,
      phone: body.phone || null,
      city: body.city || null,
      state: body.state || null,
      country: body.country || null,
      address: body.address || null,
      source: 'MANUAL',
      hasWebsite: !!body.website,
      hasEmail: !!body.email,
      hasPhone: !!body.phone,
      industry: body.industry || 'cleaning',
    },
  });
  return jsonOk(lead, 201);
}
