import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { buildLeadWhere, parseLeadFiltersFromSearchParams } from '@/lib/sales-agent/leads';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const sp = request.nextUrl.searchParams;
  const type = sp.get('type') || 'leads';
  const format = sp.get('format') || 'csv';

  if (type === 'leads') {
    const where = buildLeadWhere(parseLeadFiltersFromSearchParams(sp));
    const items = await (prisma as any).saLeadCompany.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    if (format === 'json') return jsonOk(items);

    const header =
      'id,name,website,email,phone,city,state,country,rating,reviews,leadScore,status,source,hasEmail,createdAt\n';
    const lines = items
      .map((r: any) =>
        [
          r.id,
          JSON.stringify(r.name),
          r.website || '',
          r.email || '',
          r.phone || '',
          r.city || '',
          r.state || '',
          r.country || '',
          r.googleRating ?? '',
          r.reviewCount ?? '',
          r.leadScore ?? '',
          r.status,
          r.source,
          r.hasEmail,
          r.createdAt.toISOString(),
        ].join(',')
      )
      .join('\n');

    return new NextResponse(header + lines, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="sales-agent-leads-${Date.now()}.csv"`,
      },
    });
  }

  if (type === 'sent-emails') {
    const items = await (prisma as any).saSentEmail.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: { company: { select: { name: true } }, campaign: { select: { name: true } } },
    });
    const header =
      'id,company,campaign,recipient,subject,status,aiProvider,sentAt,retryCount,messageId\n';
    const lines = items
      .map((r: any) =>
        [
          r.id,
          JSON.stringify(r.company?.name || ''),
          JSON.stringify(r.campaign?.name || ''),
          r.recipientEmail,
          JSON.stringify(r.subject),
          r.deliveryStatus,
          r.aiProvider || '',
          r.sentAt?.toISOString() || '',
          r.retryCount,
          r.messageId || '',
        ].join(',')
      )
      .join('\n');
    return new NextResponse(header + lines, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="sales-agent-emails-${Date.now()}.csv"`,
      },
    });
  }

  return jsonError('Unknown export type');
}
