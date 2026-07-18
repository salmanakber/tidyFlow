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
