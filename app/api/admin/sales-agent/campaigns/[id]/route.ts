import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { enqueueAnalyzeLead, enqueueSendEmail } from '@/lib/sales-agent/queue';
import { buildTemplateVars, renderTemplate, sendSalesEmail } from '@/lib/sales-agent/email';
import { saLog } from '@/lib/sales-agent/logger';
import { markDiscoveryGroupsEmailed } from '@/lib/sales-agent/groups';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(_request);
  if (gate instanceof NextResponse) return gate;

  const campaign = await (prisma as any).saCampaign.findUnique({
    where: { id: parseInt(params.id, 10) },
    include: {
      template: true,
      _count: { select: { leads: true, sentEmails: true } },
    },
  });
  if (!campaign) return jsonError('Campaign not found', 404);
  return jsonOk(campaign);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const body = await request.json();
  const data: Record<string, unknown> = {};
  const fields = [
    'name',
    'language',
    'country',
    'templateId',
    'aiPrompt',
    'sendingLimit',
    'delayBetweenEmails',
    'maxEmailsPerDay',
    'discoveryMethod',
    'status',
  ];
  for (const f of fields) {
    if (body[f] !== undefined) {
      data[f] = body[f] === '' ? null : body[f];
    }
  }
  if (body.cities !== undefined) {
    data.cities = Array.isArray(body.cities) ? JSON.stringify(body.cities) : body.cities;
  }
  if (body.keywords !== undefined) {
    data.keywords = Array.isArray(body.keywords) ? JSON.stringify(body.keywords) : body.keywords;
  }
  if (body.followUpSchedule !== undefined) {
    data.followUpSchedule =
      typeof body.followUpSchedule === 'string'
        ? body.followUpSchedule
        : JSON.stringify(body.followUpSchedule);
  }
  if (body.discoveryConfig !== undefined) {
    data.discoveryConfig =
      typeof body.discoveryConfig === 'string'
        ? body.discoveryConfig
        : JSON.stringify(body.discoveryConfig);
  }

  if (body.status === 'RUNNING') {
    data.startedAt = new Date();
    data.completedAt = null;
    data.lastError = null;
  }
  if (body.status === 'COMPLETED') data.completedAt = new Date();
  if (body.status === 'FAILED' && body.lastError) data.lastError = body.lastError;

  const campaign = await (prisma as any).saCampaign.update({ where: { id }, data });

  // Kick off campaign run
  if (body.status === 'RUNNING' || body.action === 'start') {
    await startCampaign(id, gate.userId);
  }

  return jsonOk(campaign);
}

function parseDiscoveryConfig(raw: unknown): {
  audience: string;
  sourceCampaignId?: number;
  skipDiscovery?: boolean;
  selectedLeadIds?: number[];
} {
  try {
    const cfg = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
    return {
      audience: (cfg.audience as any) || 'selected_leads',
      sourceCampaignId: cfg.sourceCampaignId ? Number(cfg.sourceCampaignId) : undefined,
      skipDiscovery: cfg.skipDiscovery !== false,
      selectedLeadIds: Array.isArray(cfg.selectedLeadIds)
        ? cfg.selectedLeadIds.map(Number).filter(Boolean)
        : [],
    };
  } catch {
    return { audience: 'selected_leads', skipDiscovery: true, selectedLeadIds: [] };
  }
}

async function startCampaign(campaignId: number, userId: number) {
  const campaign = await (prisma as any).saCampaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });
  if (!campaign) return;

  if (!campaign.template) {
    await (prisma as any).saCampaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED', lastError: 'No email template selected' },
    });
    return;
  }

  await (prisma as any).saCampaign.update({
    where: { id: campaignId },
    data: { status: 'RUNNING', startedAt: new Date(), lastError: null },
  });

  const cfg = parseDiscoveryConfig(campaign.discoveryConfig);
  const selectedIds = cfg.selectedLeadIds || [];

  if (!selectedIds.length) {
    await (prisma as any).saCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'FAILED',
        lastError: 'No leads selected — edit campaign and pick leads from Find Leads',
      },
    });
    await saLog({
      level: 'error',
      category: 'campaign',
      action: 'campaign_no_leads',
      message: 'Start aborted: no selectedLeadIds',
      entityType: 'SaCampaign',
      entityId: campaignId,
      userId,
      success: false,
    });
    return;
  }

  // Only the leads you picked — no auto discovery
  const ready = await (prisma as any).saLeadCompany.findMany({
    where: {
      id: { in: selectedIds },
      email: { not: null },
      hasEmail: true,
    },
    include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  // Link selected leads to this campaign for reporting
  await (prisma as any).saLeadCompany.updateMany({
    where: { id: { in: selectedIds } },
    data: { campaignId },
  });

  const limit = campaign.maxEmailsPerDay || 50;
  const toSend = ready.slice(0, limit);

  let delay = 0;
  let queued = 0;
  let skipped = 0;

  for (const lead of toSend) {
    if (!lead.email) {
      skipped++;
      continue;
    }

    // Skip if this campaign already emailed them
    const already = await (prisma as any).saSentEmail.findFirst({
      where: {
        campaignId,
        companyId: lead.id,
        deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED', 'QUEUED', 'PENDING', 'RETRYING'] },
      },
    });
    if (already) {
      skipped++;
      continue;
    }

    if (lead.hasWebsite && lead.leadScore == null) {
      await enqueueAnalyzeLead(lead.id);
    }

    const vars = await buildTemplateVars(lead.id);
    const subject = renderTemplate(campaign.template.subject, vars);
    const htmlBody = campaign.template.htmlBody
      ? renderTemplate(campaign.template.htmlBody, vars)
      : undefined;
    const textBody = campaign.template.textBody
      ? renderTemplate(campaign.template.textBody, vars)
      : undefined;

    try {
      // Mark as queued/contacted intent on the lead so UI shows progress
      await (prisma as any).saLeadCompany.update({
        where: { id: lead.id },
        data: { status: 'QUEUED', campaignId },
      });

      const record = await sendSalesEmail({
        companyId: lead.id,
        campaignId,
        templateId: campaign.templateId,
        to: lead.email,
        toName: lead.name,
        subject,
        htmlBody,
        textBody,
        aiPrompt: campaign.aiPrompt,
        aiProvider: lead.analyses[0]?.provider,
        scheduledFor: new Date(Date.now() + delay * 1000),
      });
      await enqueueSendEmail(record.id, delay * 1000);
      delay += campaign.delayBetweenEmails || 60;
      queued++;
    } catch (err: any) {
      skipped++;
      await saLog({
        level: 'warn',
        category: 'campaign',
        action: 'email_queue_skip',
        message: err.message,
        entityType: 'SaLeadCompany',
        entityId: lead.id,
        success: false,
      });
    }
  }

  await saLog({
    category: 'campaign',
    action: 'campaign_emails_queued',
    message: `Campaign ${campaign.name}: queued=${queued} skipped=${skipped} selected=${selectedIds.length}`,
    entityType: 'SaCampaign',
    entityId: campaignId,
    userId,
    details: { queued, skipped, selected: selectedIds.length },
  });

  // Mark lead groups as emailed / "Already sent" (or "Sent again" on a later wave)
  if (queued > 0) {
    const marked = await markDiscoveryGroupsEmailed(toSend.map((l: any) => l.id));
    await saLog({
      category: 'campaign',
      action: 'groups_marked_emailed',
      message: `Marked ${marked.groupsMarked} lead group(s) as already sent`,
      entityType: 'SaCampaign',
      entityId: campaignId,
      details: marked,
    });
  }

  await saLog({
    category: 'campaign',
    action: 'campaign_started',
    message: `Started campaign ${campaign.name} for ${queued} selected leads`,
    entityType: 'SaCampaign',
    entityId: campaignId,
    userId,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const campaign = await (prisma as any).saCampaign.findUnique({ where: { id } });
  if (!campaign) return jsonError('Not found', 404);
  if (campaign.status === 'RUNNING') {
    return jsonError('Pause the campaign before deleting');
  }

  const hard = request.nextUrl.searchParams.get('hard') === '1';

  if (hard) {
    // Keep historical emails/leads; only remove the campaign row
    await (prisma as any).saLeadCompany.updateMany({
      where: { campaignId: id },
      data: { campaignId: null },
    });
    await (prisma as any).saSentEmail.updateMany({
      where: { campaignId: id },
      data: { campaignId: null },
    });
    await (prisma as any).saCampaign.delete({ where: { id } });
    await saLog({
      category: 'campaign',
      action: 'campaign_deleted',
      message: `Deleted campaign ${campaign.name}`,
      entityType: 'SaCampaign',
      entityId: id,
      userId: gate.userId,
    });
    return jsonOk({ deleted: true });
  }

  await (prisma as any).saCampaign.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  return jsonOk({ archived: true });
}
