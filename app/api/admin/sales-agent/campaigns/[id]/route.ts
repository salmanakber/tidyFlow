import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { enqueueAnalyzeLead, enqueueSendEmail } from '@/lib/sales-agent/queue';
import { buildTemplateVars, renderTemplate, sendSalesEmail } from '@/lib/sales-agent/email';
import { saLog } from '@/lib/sales-agent/logger';
import { markDiscoveryGroupsEmailed } from '@/lib/sales-agent/groups';
import {
  buildFollowUpSchedule,
  parseCampaignSequence,
  resolveStepSendAt,
  type CampaignStep,
} from '@/lib/sales-agent/campaign-sequence';

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

  const emails = await (prisma as any).saSentEmail.findMany({
    where: { campaignId: campaign.id },
    select: {
      id: true,
      sequenceStep: true,
      deliveryStatus: true,
      scheduledFor: true,
      sentAt: true,
      recipientEmail: true,
      company: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const byStatus: Record<string, number> = {};
  const byStep: Record<
    number,
    { sent: number; queued: number; failed: number; canceled: number; total: number }
  > = {};
  for (const e of emails) {
    const st = String(e.deliveryStatus || 'UNKNOWN');
    byStatus[st] = (byStatus[st] || 0) + 1;
    const step = Math.max(1, Number(e.sequenceStep) || 1);
    if (!byStep[step]) byStep[step] = { sent: 0, queued: 0, failed: 0, canceled: 0, total: 0 };
    byStep[step].total++;
    if (['SENT', 'DELIVERED', 'OPENED'].includes(st)) byStep[step].sent++;
    else if (['QUEUED', 'PENDING', 'RETRYING'].includes(st)) byStep[step].queued++;
    else if (['FAILED', 'BOUNCED'].includes(st)) byStep[step].failed++;
    else if (st === 'CANCELED') byStep[step].canceled++;
  }

  let selectedLeadIds: number[] = [];
  try {
    const cfg = campaign.discoveryConfig ? JSON.parse(campaign.discoveryConfig) : {};
    selectedLeadIds = Array.isArray(cfg.selectedLeadIds) ? cfg.selectedLeadIds.map(Number) : [];
  } catch {
    /* ignore */
  }

  const { buildCampaignSequenceProgress } = await import('@/lib/sales-agent/campaign-sequence');
  const sequenceProgress = buildCampaignSequenceProgress({
    followUpSchedule: campaign.followUpSchedule,
    templateId: campaign.templateId,
    startedAt: campaign.startedAt,
    status: campaign.status,
    emails,
  });

  return jsonOk({
    ...campaign,
    selectedLeadCount: selectedLeadIds.length,
    sequenceProgress,
    dashboard: {
      totalEmails: emails.length,
      byStatus,
      byStep,
      recent: emails.slice(0, 25),
      sent: (byStatus.SENT || 0) + (byStatus.DELIVERED || 0) + (byStatus.OPENED || 0),
      queued: (byStatus.QUEUED || 0) + (byStatus.PENDING || 0) + (byStatus.RETRYING || 0),
      failed: (byStatus.FAILED || 0) + (byStatus.BOUNCED || 0),
      canceled: byStatus.CANCELED || 0,
    },
  });
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
  } else if (body.steps !== undefined) {
    data.followUpSchedule = buildFollowUpSchedule({
      steps: body.steps,
      fallbackTemplateId: body.templateId,
      skipIfReplied: body.skipIfReplied !== false,
    });
    try {
      const parsed = JSON.parse(String(data.followUpSchedule));
      if (parsed.steps?.[0]?.templateId) {
        data.templateId = Number(parsed.steps[0].templateId);
      }
    } catch {
      /* ignore */
    }
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

  const sequence = parseCampaignSequence(campaign.followUpSchedule);
  let steps: CampaignStep[] = sequence.steps;

  // Backward compatible: single template campaigns with no steps configured
  if (!steps.length && campaign.templateId) {
    steps = [
      {
        step: 1,
        templateId: campaign.templateId,
        delayDays: 0,
        label: 'Initial outreach',
      },
    ];
  }

  if (!steps.length) {
    await (prisma as any).saCampaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED', lastError: 'No email template / sequence steps selected' },
    });
    return;
  }

  // Ensure followUpSchedule is persisted for deliver-time skip-if-replied checks
  if (!campaign.followUpSchedule || !parseCampaignSequence(campaign.followUpSchedule).steps.length) {
    await (prisma as any).saCampaign.update({
      where: { id: campaignId },
      data: {
        followUpSchedule: buildFollowUpSchedule({
          steps,
          skipIfReplied: sequence.skipIfReplied,
        }),
        templateId: steps[0].templateId,
      },
    });
  }

  const templates = await (prisma as any).saEmailTemplate.findMany({
    where: { id: { in: steps.map((s) => s.templateId) } },
  });
  const templateById = new Map<number, any>(templates.map((t: any) => [t.id, t]));
  const missing = steps.filter((s) => !templateById.has(s.templateId));
  if (missing.length) {
    await (prisma as any).saCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'FAILED',
        lastError: `Missing template(s) for step(s): ${missing.map((m) => m.step).join(', ')}`,
      },
    });
    return;
  }

  const startedAt = new Date();
  await (prisma as any).saCampaign.update({
    where: { id: campaignId },
    data: { status: 'RUNNING', startedAt, lastError: null },
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

  const ready = await (prisma as any).saLeadCompany.findMany({
    where: {
      id: { in: selectedIds },
      email: { not: null },
      hasEmail: true,
    },
    include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  await (prisma as any).saLeadCompany.updateMany({
    where: { id: { in: selectedIds } },
    data: { campaignId },
  });

  // Pace only — does NOT cap total campaign size. Spread remaining leads across days.
  const perDay = Math.max(1, Number(campaign.maxEmailsPerDay) || 50);
  const staggerSeconds = Math.max(0, Number(campaign.delayBetweenEmails) || 60);

  let queued = 0;
  let skipped = 0;
  let leadIndex = 0;
  const queuedLeadIds: number[] = [];

  for (const lead of ready) {
    if (!lead.email) {
      skipped++;
      continue;
    }

    if (lead.hasWebsite && lead.leadScore == null) {
      await enqueueAnalyzeLead(lead.id);
    }

    try {
      await (prisma as any).saLeadCompany.update({
        where: { id: lead.id },
        data: { status: 'QUEUED', campaignId },
      });

      const vars = await buildTemplateVars(lead.id);
      let queuedAnyStep = false;

      // Day-bucket + within-day stagger so 111 leads aren't cut off at 50
      const dayOffset = Math.floor(leadIndex / perDay);
      const indexInDay = leadIndex % perDay;
      const leadStagger = dayOffset * 24 * 3600 + indexInDay * staggerSeconds;

      for (const step of steps) {
        const already = await (prisma as any).saSentEmail.findFirst({
          where: {
            campaignId,
            companyId: lead.id,
            sequenceStep: step.step,
            deliveryStatus: {
              in: ['SENT', 'DELIVERED', 'OPENED', 'QUEUED', 'PENDING', 'RETRYING'],
            },
          },
        });
        if (already) {
          skipped++;
          continue;
        }

        const tpl = templateById.get(step.templateId);
        const subject = renderTemplate(tpl.subject, vars);
        const htmlBody = tpl.htmlBody ? renderTemplate(tpl.htmlBody, vars) : undefined;
        const textBody = tpl.textBody ? renderTemplate(tpl.textBody, vars) : undefined;
        const scheduledFor = resolveStepSendAt(step, startedAt, leadStagger);
        const delayMs = Math.max(0, scheduledFor.getTime() - Date.now());

        const record = await sendSalesEmail({
          companyId: lead.id,
          campaignId,
          templateId: step.templateId,
          sequenceStep: step.step,
          to: lead.email,
          toName: lead.name,
          subject,
          htmlBody,
          textBody,
          aiPrompt: campaign.aiPrompt,
          aiProvider: lead.analyses[0]?.provider,
          scheduledFor,
        });
        await enqueueSendEmail(record.id, delayMs);
        queued++;
        queuedAnyStep = true;
      }

      if (queuedAnyStep) {
        queuedLeadIds.push(lead.id);
        leadIndex++;
      }
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
    message: `Campaign ${campaign.name}: steps=${steps.length} queued=${queued} skipped=${skipped} selected=${selectedIds.length} ready=${ready.length} pace=${perDay}/day`,
    entityType: 'SaCampaign',
    entityId: campaignId,
    userId,
    details: {
      queued,
      skipped,
      selected: selectedIds.length,
      ready: ready.length,
      perDay,
      daysSpanned: Math.max(1, Math.ceil(ready.length / perDay)),
      steps: steps.map((s) => ({
        step: s.step,
        templateId: s.templateId,
        delayDays: s.delayDays,
        sendAt: s.sendAt,
        label: s.label,
      })),
    },
  });

  if (queuedLeadIds.length > 0) {
    const marked = await markDiscoveryGroupsEmailed(queuedLeadIds);
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
    message: `Started campaign ${campaign.name} — ${steps.length} segment(s), queued ${queued} email(s) for ${queuedLeadIds.length}/${ready.length} leads (pace ${perDay}/day)`,
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
