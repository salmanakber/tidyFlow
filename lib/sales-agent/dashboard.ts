import prisma from '@/lib/prisma';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function getSalesAgentDashboard() {
  const today = startOfDay();
  const monthStart = startOfMonth();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalCompanies,
    newLeadsToday,
    companiesAnalyzed,
    emailsFound,
    emailsSent,
    pendingEmails,
    failedEmails,
    failedCrawls,
    positiveReplies,
    negativeReplies,
    demoRequests,
    totalReplies,
    openedEmails,
    aiUsageToday,
    aiUsageMonth,
    apiLogsToday,
  ] = await Promise.all([
    (prisma as any).saLeadCompany.count(),
    (prisma as any).saLeadCompany.count({ where: { createdAt: { gte: today } } }),
    (prisma as any).saLeadCompany.count({ where: { status: { in: ['ANALYZED', 'CONTACTED', 'REPLIED', 'CONVERTED', 'QUEUED'] } } }),
    (prisma as any).saLeadCompany.count({ where: { hasEmail: true } }),
    (prisma as any).saSentEmail.count({ where: { deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED'] } } }),
    (prisma as any).saSentEmail.count({ where: { deliveryStatus: { in: ['PENDING', 'QUEUED', 'RETRYING'] } } }),
    (prisma as any).saSentEmail.count({ where: { deliveryStatus: 'FAILED' } }),
    (prisma as any).saLeadCompany.count({ where: { crawlStatus: 'failed' } }),
    (prisma as any).saReply.count({ where: { isPositive: true } }),
    (prisma as any).saReply.count({ where: { isPositive: false } }),
    (prisma as any).saReply.count({ where: { intent: 'BOOK_DEMO' } }),
    (prisma as any).saReply.count(),
    (prisma as any).saSentEmail.count({ where: { deliveryStatus: 'OPENED' } }),
    (prisma as any).saAiUsageLog.count({ where: { createdAt: { gte: today }, success: true } }),
    (prisma as any).saAiUsageLog.count({ where: { createdAt: { gte: monthStart }, success: true } }),
    (prisma as any).saSystemLog.count({
      where: {
        createdAt: { gte: today },
        category: { in: ['api', 'google_places', 'search'] },
      },
    }),
  ]);

  const sentForOpenRate = Math.max(emailsSent, 1);
  const openRate = Math.round((openedEmails / sentForOpenRate) * 1000) / 10;
  const replyRate = Math.round((totalReplies / sentForOpenRate) * 1000) / 10;

  // Daily activity (last 14 days)
  const dailyRaw = await (prisma as any).saSystemLog.groupBy({
    by: ['category'],
    where: { createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
    _count: { _all: true },
  });

  const leadsByDay = await prisma.$queryRawUnsafe(`
    SELECT DATE("created_at") as day, COUNT(*)::int as count
    FROM sa_lead_companies
    WHERE "created_at" >= NOW() - INTERVAL '14 days'
    GROUP BY DATE("created_at")
    ORDER BY day ASC
  `).catch(() => []);

  const emailsByDay = await prisma.$queryRawUnsafe(`
    SELECT DATE("sent_at") as day, COUNT(*)::int as count
    FROM sa_sent_emails
    WHERE "sent_at" IS NOT NULL AND "sent_at" >= NOW() - INTERVAL '14 days'
    GROUP BY DATE("sent_at")
    ORDER BY day ASC
  `).catch(() => []);

  const monthlyLeads = await (prisma as any).saLeadCompany.count({
    where: { createdAt: { gte: monthStart } },
  });
  const monthlyEmails = await (prisma as any).saSentEmail.count({
    where: { sentAt: { gte: monthStart } },
  });
  const monthlyReplies = await (prisma as any).saReply.count({
    where: { receivedAt: { gte: monthStart } },
  });

  const recentLeads = await (prisma as any).saLeadCompany.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
      leadScore: true,
      status: true,
      email: true,
      createdAt: true,
    },
  });

  const scoreDistribution = await prisma.$queryRawUnsafe(`
    SELECT
      CASE
        WHEN lead_score IS NULL THEN 'unscored'
        WHEN lead_score < 40 THEN '0-39'
        WHEN lead_score < 70 THEN '40-69'
        ELSE '70-100'
      END as bucket,
      COUNT(*)::int as count
    FROM sa_lead_companies
    GROUP BY 1
    ORDER BY 1
  `).catch(() => []);

  return {
    stats: {
      totalCompanies,
      newLeadsToday,
      companiesAnalyzed,
      emailsFound,
      emailsSent,
      pendingEmails,
      openRate,
      replyRate,
      positiveReplies,
      negativeReplies,
      demoRequests,
      failedEmails,
      failedCrawls,
      aiUsage: { today: aiUsageToday, month: aiUsageMonth },
      apiUsage: { today: apiLogsToday },
      dailyActivity: {
        categories: dailyRaw.map((r: any) => ({ category: r.category, count: r._count._all })),
        leadsByDay,
        emailsByDay,
      },
      monthlyActivity: {
        leads: monthlyLeads,
        emails: monthlyEmails,
        replies: monthlyReplies,
        aiCalls: aiUsageMonth,
      },
    },
    recentLeads,
    scoreDistribution,
    window: { thirtyDaysAgo, today, monthStart },
  };
}
