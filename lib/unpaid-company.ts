/** Self-serve signup: no plan, no trial, until the customer chooses one. */

export const NO_PLAN_TIER = 'NONE';

export function unpaidCompanyCreateData(name: string) {
  return {
    name,
    planTier: NO_PLAN_TIER,
    subscriptionStatus: 'unpaid',
    isTrialActive: false,
    trialEndsAt: null,
  };
}
