/** Days-before-end milestones for trial / pending plan switch reminders. */
export const BILLING_REMINDER_MILESTONES = [5, 4, 3, 1, 0] as const;

export type BillingReminderMilestone = (typeof BILLING_REMINDER_MILESTONES)[number];

export type BillingNotificationJob = {
  companyId: number;
  title: string;
  message: string;
  notificationType: 'billing' | 'trial_ending' | 'plan_switch';
  metadata?: Record<string, unknown>;
  screenRoute?: string;
};

export type TrialEndingReminderJob = {
  companyId: number;
  trialEndsAt: string;
  daysLeft: BillingReminderMilestone;
  subscriptionId?: string;
};

export type PendingPlanReminderJob = {
  companyId: number;
  pendingPlanTier: string;
  pendingPlanLabel: string;
  effectiveAt: string;
  daysLeft: BillingReminderMilestone;
};

export function trialReminderJobId(companyId: number, trialEndsAt: Date, daysLeft: number) {
  return `trial-reminder-${companyId}-${daysLeft}-${trialEndsAt.toISOString().slice(0, 10)}`;
}

export function pendingPlanReminderJobId(
  companyId: number,
  effectiveAt: Date,
  daysLeft: number
) {
  return `plan-switch-reminder-${companyId}-${daysLeft}-${effectiveAt.toISOString().slice(0, 10)}`;
}

export function formatBillingDate(date: Date) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function buildTrialUpgradeMessage(daysLeft: number, trialEndsAt: Date) {
  const dateLabel = formatBillingDate(trialEndsAt);
  if (daysLeft <= 0) {
    return `Your free trial ends today (${dateLabel}). Your plan will upgrade to paid billing automatically. Open Billing to review your subscription.`;
  }
  if (daysLeft === 1) {
    return `Your free trial ends tomorrow (${dateLabel}). Your plan will upgrade to paid billing unless you cancel in Billing.`;
  }
  return `Your free trial ends in ${daysLeft} days (${dateLabel}). Your plan will upgrade to paid billing when the trial ends. Review details in Billing.`;
}

export function buildPendingPlanSwitchMessage(
  daysLeft: number,
  planLabel: string,
  effectiveAt: Date
) {
  const dateLabel = formatBillingDate(effectiveAt);
  if (daysLeft <= 0) {
    return `Your plan switches to ${planLabel} today (${dateLabel}). Open Billing to review your subscription.`;
  }
  if (daysLeft === 1) {
    return `Your plan switches to ${planLabel} tomorrow (${dateLabel}).`;
  }
  return `Your plan will switch to ${planLabel} in ${daysLeft} days (${dateLabel}).`;
}

/** Compute fire time for a milestone N days before `endAt`. */
export function milestoneFireTime(endAt: Date, daysLeft: number): Date {
  const fire = new Date(endAt.getTime() - daysLeft * 24 * 60 * 60 * 1000);
  // Prefer mid-morning local server time for day-of reminders
  if (daysLeft === 0) {
    fire.setHours(9, 0, 0, 0);
    if (fire.getTime() > endAt.getTime()) {
      fire.setTime(endAt.getTime() - 2 * 60 * 60 * 1000);
    }
  }
  return fire;
}

export function milestonesWithinWindow(endAt: Date, maxDays = 5): BillingReminderMilestone[] {
  const msLeft = endAt.getTime() - Date.now();
  if (msLeft <= 0) return [];
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft > maxDays) {
    return BILLING_REMINDER_MILESTONES.filter((m) => m <= maxDays);
  }
  return BILLING_REMINDER_MILESTONES.filter((m) => m <= daysLeft);
}
