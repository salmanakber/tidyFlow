import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { saLog } from '@/lib/sales-agent/logger';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const sp = request.nextUrl.searchParams;
  const status = sp.get('status');
  const where = status ? { status } : {};
  const items = await (prisma as any).saCampaign.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      template: { select: { id: true, name: true, subject: true } },
      _count: { select: { leads: true, sentEmails: true } },
    },
  });
  return jsonOk(items);
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  if (!body.name) return jsonError('Campaign name is required');

  const campaign = await (prisma as any).saCampaign.create({
    data: {
      name: body.name,
      country: body.country || null,
      cities: Array.isArray(body.cities) ? JSON.stringify(body.cities) : body.cities || null,
      keywords: Array.isArray(body.keywords) ? JSON.stringify(body.keywords) : body.keywords || null,
      templateId: body.templateId ? Number(body.templateId) : null,
      aiPrompt: body.aiPrompt || null,
      sendingLimit: body.sendingLimit != null ? Number(body.sendingLimit) : null,
      delayBetweenEmails: body.delayBetweenEmails != null ? Number(body.delayBetweenEmails) : 60,
      maxEmailsPerDay: body.maxEmailsPerDay != null ? Number(body.maxEmailsPerDay) : 50,
      followUpSchedule: body.followUpSchedule
        ? typeof body.followUpSchedule === 'string'
          ? body.followUpSchedule
          : JSON.stringify(body.followUpSchedule)
        : null,
      discoveryMethod: body.discoveryMethod || null,
      discoveryConfig: body.discoveryConfig
        ? typeof body.discoveryConfig === 'string'
          ? body.discoveryConfig
          : JSON.stringify(body.discoveryConfig)
        : null,
      status: 'DRAFT',
      createdById: gate.userId,
    },
  });

  await saLog({
    category: 'campaign',
    action: 'campaign_created',
    message: `Created campaign ${campaign.name}`,
    entityType: 'SaCampaign',
    entityId: campaign.id,
    userId: gate.userId,
  });

  return jsonOk(campaign, 201);
}
