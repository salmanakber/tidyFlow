import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { saLog } from '@/lib/sales-agent/logger';
import { buildFollowUpSchedule } from '@/lib/sales-agent/campaign-sequence';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const sp = request.nextUrl.searchParams;
  const status = sp.get('status');
  const language = sp.get('language');
  const country = sp.get('country');
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (language) where.language = language;
  if (country) where.country = country;
  const items = await (prisma as any).saCampaign.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      template: { select: { id: true, name: true, subject: true, language: true, country: true } },
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

  const followUpSchedule =
    body.followUpSchedule != null
      ? typeof body.followUpSchedule === 'string'
        ? body.followUpSchedule
        : JSON.stringify(body.followUpSchedule)
      : buildFollowUpSchedule({
          steps: body.steps,
          fallbackTemplateId: body.templateId,
          skipIfReplied: body.skipIfReplied !== false,
        });

  let primaryTemplateId = body.templateId ? Number(body.templateId) : null;
  try {
    const parsed = JSON.parse(followUpSchedule);
    if (Array.isArray(parsed.steps) && parsed.steps[0]?.templateId) {
      primaryTemplateId = Number(parsed.steps[0].templateId);
    }
  } catch {
    /* ignore */
  }

  const campaign = await (prisma as any).saCampaign.create({
    data: {
      name: body.name,
      language: body.language || null,
      country: body.country || null,
      cities: Array.isArray(body.cities) ? JSON.stringify(body.cities) : body.cities || null,
      keywords: Array.isArray(body.keywords) ? JSON.stringify(body.keywords) : body.keywords || null,
      templateId: primaryTemplateId,
      aiPrompt: body.aiPrompt || null,
      sendingLimit: body.sendingLimit != null ? Number(body.sendingLimit) : null,
      delayBetweenEmails: body.delayBetweenEmails != null ? Number(body.delayBetweenEmails) : 60,
      maxEmailsPerDay: body.maxEmailsPerDay != null ? Number(body.maxEmailsPerDay) : 50,
      followUpSchedule,
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
