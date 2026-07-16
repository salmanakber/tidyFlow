import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { enqueueAnalyzeLead } from '@/lib/sales-agent/queue';
import { analyzeLeadCompany } from '@/lib/sales-agent/analyzer';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const lead = await (prisma as any).saLeadCompany.findUnique({
    where: { id },
    include: {
      contacts: true,
      analyses: { orderBy: { createdAt: 'desc' } },
      sentEmails: { orderBy: { createdAt: 'desc' }, take: 50 },
      replies: { orderBy: { receivedAt: 'desc' }, take: 50 },
      campaign: true,
    },
  });
  if (!lead) return jsonError('Lead not found', 404);
  return jsonOk(lead);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const body = await request.json();
  const allowed = [
    'name',
    'website',
    'email',
    'phone',
    'city',
    'state',
    'country',
    'address',
    'status',
    'companySize',
    'industry',
    'category',
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (data.email != null) data.hasEmail = !!data.email;
  if (data.phone != null) data.hasPhone = !!data.phone;
  if (data.website != null) data.hasWebsite = !!data.website;

  const lead = await (prisma as any).saLeadCompany.update({ where: { id }, data });
  return jsonOk(lead);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const body = await request.json().catch(() => ({}));
  if (body.async === false) {
    const analysis = await analyzeLeadCompany(id);
    return jsonOk(analysis);
  }
  await enqueueAnalyzeLead(id);
  return jsonOk({ queued: true, companyId: id });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const existing = await (prisma as any).saLeadCompany.findUnique({ where: { id } });
  if (!existing) return jsonError('Lead not found', 404);

  await (prisma as any).saLeadCompany.delete({ where: { id } });
  return jsonOk({ deleted: true, id });
}
