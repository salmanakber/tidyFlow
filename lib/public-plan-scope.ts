/** Shared display helpers for public pricing / subscribe pages. */

export type PublicPlanPayload = {
  tier: string;
  label: string;
  monthlyPrice: number;
  currency?: string;
  trialDays?: number;
  limits?: {
    cleaners?: number;
    properties?: number;
    managers?: number;
    aiRequestsPerMonth?: number;
    invoicesPerMonth?: number;
    photoVerificationsPerMonth?: number;
    pdfGenerationsPerMonth?: number;
  };
  scope?: {
    maxCleaners?: number;
    maxProperties?: number;
    maxManagers?: number;
    aiRequestsPerMonth?: number;
    maxInvoicesPerMonth?: number;
    maxPhotoVerificationsPerMonth?: number;
    maxPdfGenerationsPerMonth?: number;
  };
  features?: {
    aiPhotoAnalysis?: boolean;
    aiInsights?: boolean;
    aiAssignment?: boolean;
    aiTaskSuggestions?: boolean;
    aiSupplyForecast?: boolean;
    invoicesEnabled?: boolean;
    aiInvoiceAssist?: boolean;
    googleSheetsEnabled?: boolean;
    quickbooksEnabled?: boolean;
  };
};

export type ScopeItem = {
  id: string;
  label: string;
  value?: string;
  included: boolean;
  kind: 'limit' | 'feature';
};

function formatLimit(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v >= 99999) return 'Unlimited';
  if (v >= 999) return 'Unlimited';
  return String(v);
}

function lim(plan: PublicPlanPayload, key: keyof NonNullable<PublicPlanPayload['limits']>, scopeKey?: keyof NonNullable<PublicPlanPayload['scope']>) {
  const fromLimits = plan.limits?.[key];
  if (fromLimits != null) return Number(fromLimits);
  if (scopeKey && plan.scope?.[scopeKey] != null) return Number(plan.scope[scopeKey]);
  return undefined;
}

/** Full plan scope for marketing / subscribe UI. */
export function getPublicPlanScopeItems(plan: PublicPlanPayload): ScopeItem[] {
  const f = plan.features || {};
  const properties = lim(plan, 'properties', 'maxProperties');
  const cleaners = lim(plan, 'cleaners', 'maxCleaners');
  const managers = lim(plan, 'managers', 'maxManagers');
  const aiRequests = lim(plan, 'aiRequestsPerMonth', 'aiRequestsPerMonth');
  const invoices = lim(plan, 'invoicesPerMonth', 'maxInvoicesPerMonth');
  const photos = lim(plan, 'photoVerificationsPerMonth', 'maxPhotoVerificationsPerMonth');
  const pdfs = lim(plan, 'pdfGenerationsPerMonth', 'maxPdfGenerationsPerMonth');

  return [
    { id: 'properties', label: 'Properties', value: formatLimit(properties), included: true, kind: 'limit' },
    { id: 'cleaners', label: 'Cleaners', value: formatLimit(cleaners), included: true, kind: 'limit' },
    { id: 'managers', label: 'Managers', value: formatLimit(managers), included: true, kind: 'limit' },
    { id: 'aiRequests', label: 'AI requests / month', value: formatLimit(aiRequests), included: true, kind: 'limit' },
    {
      id: 'invoices',
      label: 'Client invoices / month',
      value: formatLimit(invoices),
      included: !!f.invoicesEnabled,
      kind: 'limit',
    },
    {
      id: 'photos',
      label: 'Photo verifications / month',
      value: formatLimit(photos),
      included: !!f.aiPhotoAnalysis,
      kind: 'limit',
    },
    {
      id: 'pdfs',
      label: 'PDF reports / month',
      value: formatLimit(pdfs),
      included: true,
      kind: 'limit',
    },
    { id: 'aiPhoto', label: 'AI photo analysis', included: !!f.aiPhotoAnalysis, kind: 'feature' },
    { id: 'aiInsights', label: 'AI insights', included: !!f.aiInsights, kind: 'feature' },
    { id: 'aiAssign', label: 'AI assignment', included: !!f.aiAssignment, kind: 'feature' },
    { id: 'aiTasks', label: 'AI task suggestions', included: !!f.aiTaskSuggestions, kind: 'feature' },
    { id: 'aiSupply', label: 'AI supply forecast', included: !!f.aiSupplyForecast, kind: 'feature' },
    { id: 'invoicesFeat', label: 'Client invoicing', included: !!f.invoicesEnabled, kind: 'feature' },
    { id: 'aiInvoice', label: 'AI invoice assist', included: !!f.aiInvoiceAssist, kind: 'feature' },
    { id: 'sheets', label: 'Google Sheets sync', included: !!f.googleSheetsEnabled, kind: 'feature' },
    { id: 'qb', label: 'QuickBooks integration', included: !!f.quickbooksEnabled, kind: 'feature' },
  ];
}

export const SUBSCRIBE_THEME = {
  navy: '#0B1E36',
  navyDeep: '#061525',
  navyMid: '#132A45',
  amber: '#F59E0B',
  amberDeep: '#D97706',
  amberSoft: '#FEF3C7',
  amberGlow: 'rgba(245, 158, 11, 0.18)',
  canvas: '#F7F4EE',
  surface: '#FFFFFF',
  ink: '#0B1E36',
  inkMid: '#4A5D73',
  inkFaint: '#8A9BB0',
  border: '#E6E0D6',
  rose: '#E11D48',
  emerald: '#059669',
} as const;
