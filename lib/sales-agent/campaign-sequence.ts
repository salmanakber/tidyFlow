/** Campaign multi-step / segment helpers */

export interface CampaignStep {
  step: number;
  templateId: number;
  /** Days after campaign start (0 = immediate, subject to stagger). Ignored if sendAt is set. */
  delayDays?: number;
  /** Absolute ISO datetime to send this step. Takes precedence over delayDays. */
  sendAt?: string | null;
  label?: string;
  /** Skip this step if the lead already replied to an earlier email in this campaign */
  skipIfReplied?: boolean;
}

export interface CampaignSequenceConfig {
  steps: CampaignStep[];
  /** Default: true — later steps skip leads who replied */
  skipIfReplied?: boolean;
}

export function parseCampaignSequence(raw: unknown): CampaignSequenceConfig {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
    const stepsRaw = Array.isArray(parsed?.steps) ? parsed.steps : [];
    const steps: CampaignStep[] = stepsRaw
      .map((s: any, idx: number) => ({
        step: Number(s.step) || idx + 1,
        templateId: Number(s.templateId) || 0,
        delayDays: s.delayDays != null ? Math.max(0, Number(s.delayDays)) : 0,
        sendAt: s.sendAt || null,
        label: s.label ? String(s.label) : `Email ${idx + 1}`,
        skipIfReplied: s.skipIfReplied !== false,
      }))
      .filter((s: CampaignStep) => s.templateId > 0)
      .sort((a: CampaignStep, b: CampaignStep) => a.step - b.step);

    return {
      steps,
      skipIfReplied: parsed.skipIfReplied !== false,
    };
  } catch {
    return { steps: [], skipIfReplied: true };
  }
}

/** Build sequence from UI form or legacy single templateId */
export function buildFollowUpSchedule(opts: {
  steps?: CampaignStep[];
  fallbackTemplateId?: number | null;
  skipIfReplied?: boolean;
}): string {
  let steps = Array.isArray(opts.steps) ? [...opts.steps] : [];
  if (!steps.length && opts.fallbackTemplateId) {
    steps = [
      {
        step: 1,
        templateId: Number(opts.fallbackTemplateId),
        delayDays: 0,
        label: 'Initial outreach',
      },
    ];
  }
  steps = steps
    .filter((s) => s.templateId)
    .map((s, idx) => ({
      ...s,
      step: idx + 1,
      delayDays: s.sendAt ? 0 : Math.max(0, Number(s.delayDays) || 0),
      sendAt: s.sendAt || null,
      label: s.label || `Email ${idx + 1}`,
    }));

  return JSON.stringify({
    steps,
    skipIfReplied: opts.skipIfReplied !== false,
  });
}

export function resolveStepSendAt(
  step: CampaignStep,
  campaignStartedAt: Date,
  staggerSeconds: number
): Date {
  if (step.sendAt) {
    const absolute = new Date(step.sendAt);
    if (!Number.isNaN(absolute.getTime())) {
      return new Date(absolute.getTime() + staggerSeconds * 1000);
    }
  }
  const days = Math.max(0, Number(step.delayDays) || 0);
  return new Date(
    campaignStartedAt.getTime() + days * 24 * 60 * 60 * 1000 + staggerSeconds * 1000
  );
}

export function formatStepSchedule(step: CampaignStep): string {
  if (step.sendAt) {
    try {
      return `on ${new Date(step.sendAt).toLocaleString()}`;
    } catch {
      return `on ${step.sendAt}`;
    }
  }
  const d = Number(step.delayDays) || 0;
  if (d <= 0) return 'immediately';
  if (d === 1) return 'after 1 day';
  return `after ${d} days`;
}

/** Expand a parent template pack (+ children) into campaign sequence steps. */
export async function expandTemplatePackToSteps(
  prismaClient: any,
  rootTemplateId: number
): Promise<CampaignStep[]> {
  const root = await prismaClient.saEmailTemplate.findUnique({
    where: { id: rootTemplateId },
    include: {
      children: { orderBy: [{ delayDays: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!root) return [];

  // If this is a child, walk up to parent pack
  let pack = root;
  if (root.parentId) {
    pack = await prismaClient.saEmailTemplate.findUnique({
      where: { id: root.parentId },
      include: {
        children: { orderBy: [{ delayDays: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!pack) return [];
  }

  const steps: CampaignStep[] = [
    {
      step: 1,
      templateId: pack.id,
      delayDays: 0,
      label: pack.stepLabel || pack.name || 'Initial outreach',
    },
  ];

  const children = Array.isArray(pack.children) ? pack.children : [];
  children.forEach((child: any, idx: number) => {
    steps.push({
      step: idx + 2,
      templateId: child.id,
      delayDays: Math.max(0, Number(child.delayDays) || idx + 1),
      label: child.stepLabel || child.name || `Follow-up day ${child.delayDays || idx + 1}`,
    });
  });

  return steps;
}

export type RoundStatus = 'sent' | 'sending' | 'upcoming' | 'canceled' | 'failed' | 'pending';

export interface CampaignRoundProgress {
  step: number;
  label: string;
  delayDays: number;
  sendAt?: string | null;
  status: RoundStatus;
  sent: number;
  queued: number;
  failed: number;
  canceled: number;
  total: number;
  /** Earliest scheduled time for remaining queued emails in this step */
  nextAt: string | null;
  summary: string;
}

export interface CampaignSequenceProgress {
  rounds: CampaignRoundProgress[];
  currentStep: number | null;
  nextUpcoming: CampaignRoundProgress | null;
  headline: string;
}

function formatRelativeWhen(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const when = d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (diffMs <= 0) {
    if (mins < 2) return `now (${when})`;
    if (mins < 60) return `${mins}m ago (${when})`;
    if (hours < 48) return `${hours}h ago (${when})`;
    return when;
  }
  if (mins < 60) return `in ${mins}m · ${when}`;
  if (hours < 48) return `in ${hours}h · ${when}`;
  return `in ${days}d · ${when}`;
}

/** Build live multi-segment round status from campaign schedule + sent email rows */
export function buildCampaignSequenceProgress(input: {
  followUpSchedule?: unknown;
  templateId?: number | null;
  startedAt?: Date | string | null;
  status?: string | null;
  emails: Array<{
    sequenceStep?: number | null;
    deliveryStatus?: string | null;
    scheduledFor?: Date | string | null;
    sentAt?: Date | string | null;
  }>;
}): CampaignSequenceProgress {
  const seq = parseCampaignSequence(input.followUpSchedule);
  let steps = seq.steps;
  if (!steps.length && input.templateId) {
    steps = [
      {
        step: 1,
        templateId: Number(input.templateId),
        delayDays: 0,
        label: 'Initial outreach',
      },
    ];
  }

  const startedAt = input.startedAt ? new Date(input.startedAt) : null;
  const emails = input.emails || [];
  const SENT = new Set(['SENT', 'DELIVERED', 'OPENED']);
  const QUEUED = new Set(['QUEUED', 'PENDING', 'RETRYING']);

  const rounds: CampaignRoundProgress[] = steps.map((step) => {
    const stepEmails = emails.filter((e) => Math.max(1, Number(e.sequenceStep) || 1) === step.step);
    const sent = stepEmails.filter((e) => SENT.has(String(e.deliveryStatus || '').toUpperCase())).length;
    const queued = stepEmails.filter((e) => QUEUED.has(String(e.deliveryStatus || '').toUpperCase())).length;
    const failed = stepEmails.filter((e) =>
      ['FAILED', 'BOUNCED'].includes(String(e.deliveryStatus || '').toUpperCase())
    ).length;
    const canceled = stepEmails.filter(
      (e) => String(e.deliveryStatus || '').toUpperCase() === 'CANCELED'
    ).length;
    const total = stepEmails.length;

    let nextAt: string | null = null;
    const queuedTimes = stepEmails
      .filter((e) => QUEUED.has(String(e.deliveryStatus || '').toUpperCase()) && e.scheduledFor)
      .map((e) => new Date(e.scheduledFor as any).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);
    if (queuedTimes.length) nextAt = new Date(queuedTimes[0]).toISOString();
    else if (startedAt && !Number.isNaN(startedAt.getTime()) && sent === 0 && queued === 0 && total === 0) {
      // Planned from schedule even before rows exist
      nextAt = resolveStepSendAt(step, startedAt, 0).toISOString();
    }

    let status: RoundStatus = 'pending';
    if (canceled > 0 && sent === 0 && queued === 0) status = 'canceled';
    else if (sent > 0 && queued === 0) status = 'sent';
    else if (queued > 0 && sent > 0) status = 'sending';
    else if (queued > 0) status = 'upcoming';
    else if (failed > 0 && sent === 0) status = 'failed';
    else if (input.status === 'RUNNING' || input.status === 'PAUSED') {
      // Not started yet for this step — show as upcoming if later than current
      status = 'upcoming';
    }

    const label = step.label || `Email ${step.step}`;
    let summary = '';
    if (status === 'sent') {
      summary = `Round ${step.step} sent (${sent})`;
    } else if (status === 'sending') {
      summary = `Round ${step.step} sending — ${sent} sent, ${queued} left`;
    } else if (status === 'upcoming' || status === 'pending') {
      const when = nextAt ? formatRelativeWhen(nextAt) : formatStepSchedule(step);
      summary = `Round ${step.step} upcoming ${when}`;
    } else if (status === 'failed') {
      summary = `Round ${step.step} failed (${failed})`;
    } else if (status === 'canceled') {
      summary = `Round ${step.step} canceled`;
    }

    return {
      step: step.step,
      label,
      delayDays: Number(step.delayDays) || 0,
      sendAt: step.sendAt || null,
      status,
      sent,
      queued,
      failed,
      canceled,
      total,
      nextAt,
      summary,
    };
  });

  const current =
    rounds.find((r) => r.status === 'sending') ||
    rounds.find((r) => r.status === 'upcoming' && r.queued > 0) ||
    rounds.find((r) => r.status === 'upcoming' || r.status === 'pending') ||
    null;
  const nextUpcoming =
    rounds.find((r) => r.status === 'upcoming' || r.status === 'sending' || r.status === 'pending') ||
    null;

  const sentRounds = rounds.filter((r) => r.status === 'sent');
  let headline = '';
  if (!rounds.length) headline = 'No segments';
  else if (sentRounds.length === rounds.length) headline = `All ${rounds.length} rounds sent`;
  else if (sentRounds.length && nextUpcoming) {
    headline = `Round ${sentRounds[sentRounds.length - 1].step} sent · next: ${nextUpcoming.summary.replace(/^Round \d+ /, '')}`;
  } else if (nextUpcoming) {
    headline = nextUpcoming.summary;
  } else {
    headline = `${rounds.length} segment${rounds.length === 1 ? '' : 's'}`;
  }

  return {
    rounds,
    currentStep: current?.step ?? null,
    nextUpcoming,
    headline,
  };
}
