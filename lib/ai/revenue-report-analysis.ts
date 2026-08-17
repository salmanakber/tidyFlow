import { aiChat, parseJSONResponse } from './client';

export interface RevenueAnalysisInput {
  companyId: number;
  from: string;
  to: string;
  locale?: string | null;
  focus?: 'overall' | 'margin' | 'cash' | 'costs';
  propertyId?: number | null;
  report: {
    summary: Record<string, unknown>;
    marginByProperty?: Array<Record<string, unknown>>;
    marginByClient?: Array<Record<string, unknown>>;
    expensesByCategory?: Array<{ category: string; amount: number }>;
    unpaidInvoices?: Array<Record<string, unknown>>;
  };
}

export interface RevenueAnalysisReport {
  title: string;
  periodLabel: string;
  executiveSummary: string;
  profitHealth: {
    rating: 'strong' | 'stable' | 'weak' | 'critical';
    score: number;
    explanation: string;
  };
  highlights: string[];
  risks: string[];
  marginInsights: Array<{ label: string; insight: string }>;
  cashInsights: string[];
  costInsights: string[];
  recommendations: Array<{ priority: 'high' | 'medium' | 'low'; action: string; why: string }>;
  closingNote: string;
  aiGenerated: boolean;
}

function ruleBasedAnalysis(input: RevenueAnalysisInput): RevenueAnalysisReport {
  const s = input.report.summary || {};
  const net = Number(s.netProfit ?? 0);
  const rev = Number(s.totalRevenue ?? s.cashRevenue ?? 0);
  const labor = Number(s.laborCost ?? 0);
  const cogs = Number(s.supplyCogs ?? 0);
  const outstanding = Number(s.outstandingAR ?? 0);
  const marginPct = rev > 0 ? Math.round((net / rev) * 1000) / 10 : 0;

  const rating: RevenueAnalysisReport['profitHealth']['rating'] =
    marginPct >= 25 ? 'strong' : marginPct >= 10 ? 'stable' : marginPct >= 0 ? 'weak' : 'critical';

  const topProperty = (input.report.marginByProperty || [])[0];
  const worstProperty = [...(input.report.marginByProperty || [])].sort(
    (a, b) => Number(a.margin ?? 0) - Number(b.margin ?? 0)
  )[0];

  return {
    title: 'Profit margin analysis',
    periodLabel: `${input.from.slice(0, 10)} → ${input.to.slice(0, 10)}`,
    executiveSummary: `Net profit is ${net.toFixed(2)} on ${rev.toFixed(2)} revenue (${marginPct}% margin). Labor ${labor.toFixed(2)}, supplies ${cogs.toFixed(2)}, outstanding AR ${outstanding.toFixed(2)}.`,
    profitHealth: {
      rating,
      score: Math.max(0, Math.min(100, Math.round(50 + marginPct))),
      explanation: `Overall margin is ${marginPct}%. ${
        rating === 'strong'
          ? 'Healthy contribution after payroll and supplies.'
          : rating === 'stable'
            ? 'Acceptable but there is room to improve margins.'
            : 'Margins need attention — review pricing, payroll efficiency, and unpaid invoices.'
      }`,
    },
    highlights: [
      `Revenue basis: ${String(s.revenueBasis || 'cash')}`,
      topProperty
        ? `Strongest property margin: ${String(topProperty.label)} (${Number(topProperty.marginPct ?? 0)}%)`
        : 'No property margin rows in this range.',
    ].filter(Boolean),
    risks: [
      outstanding > 0 ? `Outstanding receivables: ${outstanding.toFixed(2)}` : '',
      worstProperty && Number(worstProperty.margin ?? 0) < 0
        ? `Negative margin at ${String(worstProperty.label)}`
        : '',
      labor > rev * 0.55 ? 'Labor is high relative to revenue (>55%).' : '',
    ].filter(Boolean),
    marginInsights: (input.report.marginByProperty || []).slice(0, 5).map((row) => ({
      label: String(row.label || 'Property'),
      insight: `Margin ${Number(row.margin ?? 0).toFixed(2)} (${Number(row.marginPct ?? 0)}%) on ${Number(row.revenue ?? 0).toFixed(2)} revenue.`,
    })),
    cashInsights: [
      `Cash revenue (paid invoices): ${Number(s.cashRevenue ?? 0).toFixed(2)}`,
      `Unpaid invoices: ${Number(s.unpaidInvoiceCount ?? 0)}`,
    ],
    costInsights: [
      `Payroll: ${labor.toFixed(2)}`,
      `Supply COGS: ${cogs.toFixed(2)}`,
      ...(input.report.expensesByCategory || [])
        .slice(0, 4)
        .map((c) => `${c.category}: ${Number(c.amount).toFixed(2)}`),
    ],
    recommendations: [
      {
        priority: outstanding > 0 ? 'high' : 'medium',
        action: outstanding > 0 ? 'Follow up unpaid invoices first' : 'Keep cash collection tight',
        why: 'Cash gap reduces true realized profit even when jobs look profitable.',
      },
      {
        priority: marginPct < 15 ? 'high' : 'low',
        action: 'Review low-margin properties and price or labor mix',
        why: 'Small margin improvements on weak properties lift company profit fastest.',
      },
    ],
    closingNote: 'Rule-based overview — enable AI keys for a deeper narrative analysis.',
    aiGenerated: false,
  };
}

export async function generateRevenueAnalysis(
  input: RevenueAnalysisInput
): Promise<RevenueAnalysisReport> {
  const fallback = ruleBasedAnalysis(input);

  try {
    const focus = input.focus || 'overall';
    const prompt = `You are TidyFlow CFO assistant for a cleaning operations company.
Analyze this P&L / margin report and respond ONLY with valid JSON:
{
  "title": "<report title>",
  "periodLabel": "<human period label>",
  "executiveSummary": "<2-4 sentences>",
  "profitHealth": { "rating": "strong|stable|weak|critical", "score": <0-100>, "explanation": "<short>" },
  "highlights": ["<bullet>", "..."],
  "risks": ["<bullet>", "..."],
  "marginInsights": [{"label":"<property or client>","insight":"<why>"}],
  "cashInsights": ["<bullet>"],
  "costInsights": ["<bullet>"],
  "recommendations": [{"priority":"high|medium|low","action":"<what to do>","why":"<reason>"}],
  "closingNote": "<one encouraging closing line>"
}

Focus: ${focus}
Date range: ${input.from} to ${input.to}
${input.propertyId ? `Filter propertyId: ${input.propertyId}` : 'All properties'}

Report JSON:
${JSON.stringify({
  summary: input.report.summary,
  marginByProperty: (input.report.marginByProperty || []).slice(0, 8),
  marginByClient: (input.report.marginByClient || []).slice(0, 8),
  expensesByCategory: (input.report.expensesByCategory || []).slice(0, 8),
  unpaidInvoices: (input.report.unpaidInvoices || []).slice(0, 8),
})}

Be practical for cleaning business owners. Use concrete numbers from the data.`;

    const aiResult = await aiChat(
      [
        {
          role: 'system',
          content:
            'TidyFlow revenue analyst. JSON only. Write human-readable fields in the user language instruction.',
        },
        { role: 'user', content: prompt },
      ],
      { companyId: input.companyId, jsonMode: true, locale: input.locale }
    );

    const parsed = parseJSONResponse<Partial<RevenueAnalysisReport>>(aiResult.text);
    if (!parsed?.executiveSummary) return fallback;

    return {
      title: parsed.title || fallback.title,
      periodLabel: parsed.periodLabel || fallback.periodLabel,
      executiveSummary: parsed.executiveSummary,
      profitHealth: {
        rating: parsed.profitHealth?.rating || fallback.profitHealth.rating,
        score: Number(parsed.profitHealth?.score ?? fallback.profitHealth.score),
        explanation: parsed.profitHealth?.explanation || fallback.profitHealth.explanation,
      },
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 6) : fallback.highlights,
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6) : fallback.risks,
      marginInsights: Array.isArray(parsed.marginInsights)
        ? parsed.marginInsights.slice(0, 8)
        : fallback.marginInsights,
      cashInsights: Array.isArray(parsed.cashInsights)
        ? parsed.cashInsights.slice(0, 6)
        : fallback.cashInsights,
      costInsights: Array.isArray(parsed.costInsights)
        ? parsed.costInsights.slice(0, 6)
        : fallback.costInsights,
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, 6)
        : fallback.recommendations,
      closingNote: parsed.closingNote || fallback.closingNote,
      aiGenerated: true,
    };
  } catch (error) {
    console.warn('AI revenue analysis fallback:', error);
    return fallback;
  }
}
