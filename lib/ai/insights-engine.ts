import prisma from '@/lib/prisma';
import { getAIConfig, isAIEnabled } from './config';
import { aiChat, parseJSONResponse } from './client';
import { createNotification } from '@/lib/notifications';

interface GeneratedInsight {
  type: string;
  severity: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
}

export async function generateCompanyInsights(companyId: number, locale?: string | null) {
  const config = await getAIConfig(companyId);
  if (!isAIEnabled(config) || !config.insightsEnabled) return [];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [tasks, feedback, cleaners, properties] = await Promise.all([
    prisma.task.groupBy({
      by: ['status'],
      where: { companyId, createdAt: { gte: thirtyDaysAgo } },
      _count: true,
    }),
    prisma.clientFeedback.findMany({
      where: { task: { companyId }, createdAt: { gte: thirtyDaysAgo } },
      select: { rating: true, taskId: true, comment: true },
    }),
    prisma.cleanerAIProfile.findMany({
      where: { companyId },
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.property.count({ where: { companyId, isActive: true } }),
  ]);

  const lowRatings = feedback.filter((f) => f.rating <= 2);
  const avgRating =
    feedback.length > 0
      ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length
      : 0;

  const underperformers = cleaners.filter((c) => c.qualityScore < 60);
  const topPerformers = cleaners.filter((c) => c.qualityScore >= 85);

  const insights: GeneratedInsight[] = [];

  if (lowRatings.length >= 2) {
    insights.push({
      type: 'client_risk',
      severity: 'high',
      title: 'Client Satisfaction Risk',
      message: `${lowRatings.length} low ratings (≤2 stars) in the last 30 days. Average rating: ${avgRating.toFixed(1)}/5.`,
    });
  }

  if (underperformers.length > 0) {
    insights.push({
      type: 'workforce',
      severity: 'medium',
      title: 'Training Opportunity',
      message: `${underperformers.length} cleaner(s) below quality threshold. Consider training or reduced assignments.`,
    });
  }

  if (topPerformers.length > 0) {
    insights.push({
      type: 'workforce',
      severity: 'low',
      title: 'Top Performers Identified',
      message: `${topPerformers.length} cleaner(s) exceeding 85% quality score. Consider assigning high-value clients.`,
    });
  }

  const supplyItems = await prisma.supplyItem.findMany({
    where: { companyId, isActive: true },
  });
  for (const item of supplyItems) {
    if (item.currentStock <= item.minStock) {
      insights.push({
        type: 'supply',
        severity: item.currentStock === 0 ? 'critical' : 'high',
        title: 'Low Supply Alert',
        message: `${item.name} is at ${item.currentStock} ${item.unit} (min: ${item.minStock}).`,
        entityType: 'supply',
        entityId: item.id,
      });
    }
  }

  try {
    const { getCompanyPlan } = await import('@/lib/subscription');
    const plan = await getCompanyPlan(companyId);
    if (plan?.limits.aiSupplyForecast) {
      const { getCompanySupplyForecast } = await import('@/lib/supply-forecast');
      const forecast = await getCompanySupplyForecast(companyId);
      for (const alert of forecast.alerts.slice(0, 3)) {
        insights.push({
          type: 'supply',
          severity: alert.severity === 'critical' ? 'critical' : alert.severity === 'high' ? 'high' : 'medium',
          title: 'Supply Forecast',
          message: alert.message,
          entityType: 'supply',
          entityId: alert.supplyItemId,
        });
      }
    }
  } catch (error) {
    console.warn('Supply forecast insights skipped:', error);
  }

  try {
    const prompt = `As TidyFlow AI operations advisor, review this company data and add up to 3 actionable insights.
Tasks by status: ${JSON.stringify(tasks)}
Avg client rating: ${avgRating.toFixed(1)}
Properties: ${properties}
Respond JSON: { "insights": [{ "type": "client_risk|workforce|revenue|operations", "severity": "low|medium|high", "title": "...", "message": "..." }] }`;

    const aiResult = await aiChat(
      [
        { role: 'system', content: 'TidyFlow AI business intelligence. JSON only. Be concise and actionable.' },
        { role: 'user', content: prompt },
      ],
      { companyId, jsonMode: true, locale }
    );

    const aiInsights = parseJSONResponse<{ insights: GeneratedInsight[] }>(aiResult.text);
    if (aiInsights.insights?.length) {
      insights.push(...aiInsights.insights.slice(0, 3));
    }
  } catch (error) {
    console.error('AI insights generation failed:', error);
  }

  const created = [];
  for (const insight of insights) {
    const existing = await prisma.aIInsight.findFirst({
      where: {
        companyId,
        title: insight.title,
        dismissedAt: null,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    if (existing) continue;

    const record = await prisma.aIInsight.create({
      data: {
        companyId,
        type: insight.type,
        severity: insight.severity,
        title: insight.title,
        message: insight.message,
        entityType: insight.entityType,
        entityId: insight.entityId,
      },
    });
    created.push(record);

    const managers = await prisma.user.findMany({
      where: {
        companyId,
        role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
        isActive: true,
      },
      select: { id: true },
    });

    for (const manager of managers) {
      await createNotification({
        userId: manager.id,
        title: `TidyFlow AI: ${insight.title}`,
        message: insight.message,
        type: 'task_updated',
        metadata: { insightId: record.id, insightType: insight.type },
        screenRoute: 'AnalyticsAI',
      });
    }
  }

  return created;
}
