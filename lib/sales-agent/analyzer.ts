import prisma from '@/lib/prisma';
import { crawlWebsite } from './crawler';
import { salesAgentChat, parseJsonLoose } from './ai-provider';
import { saLog } from './logger';

export interface AnalysisFlags {
  needsTidyFlow: boolean;
  hasBookingSoftware: boolean;
  hasClientPortal: boolean;
  hasSchedulingSoftware: boolean;
  hasInspectionMgmt: boolean;
  hasStaffManagement: boolean;
  websiteOutdated: boolean;
  leadScore: number;
  scoreReason: string;
  personalizedIntro: string;
}

const ANALYSIS_PROMPT = `You are evaluating cleaning / facilities companies as potential customers for TidyFlow — a cleaning operations platform (scheduling, staff, inspections, client portal, GPS proof of work).

Analyze the website content and return JSON only:
{
  "needsTidyFlow": boolean,
  "hasBookingSoftware": boolean,
  "hasClientPortal": boolean,
  "hasSchedulingSoftware": boolean,
  "hasInspectionMgmt": boolean,
  "hasStaffManagement": boolean,
  "websiteOutdated": boolean,
  "leadScore": number (0-100),
  "scoreReason": "short explanation",
  "personalizedIntro": "one personalized outreach sentence mentioning their company"
}

Higher scores: established cleaning company, outdated tech, no clear ops software, commercial/office focus.
Lower scores: already using competitor software, not a cleaning business, personal blog, or agency.`;

export async function analyzeLeadCompany(companyId: number): Promise<any> {
  const company = await (prisma as any).saLeadCompany.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('Lead company not found');
  if (!company.website) throw new Error('Lead has no website to analyze');

  const crawl = await crawlWebsite(company.website);
  const primaryEmail = crawl.emails[0] || company.email || null;

  await (prisma as any).saLeadCompany.update({
    where: { id: companyId },
    data: {
      email: primaryEmail || company.email,
      phone: crawl.phones[0] || company.phone,
      hasEmail: !!(primaryEmail || company.email),
      hasPhone: !!(crawl.phones[0] || company.phone),
      socialLinks: JSON.stringify(crawl.socialLinks),
      services: JSON.stringify(crawl.services),
      aboutSnippet: crawl.aboutSnippet,
      contactPageUrl: crawl.contactPageUrl,
      aboutPageUrl: crawl.aboutPageUrl,
      crawlStatus: crawl.success ? 'success' : 'failed',
      crawlError: crawl.error || null,
      lastCrawledAt: new Date(),
      name: company.name === company.websiteNormalized && crawl.title ? crawl.title : company.name,
    },
  });

  if (primaryEmail) {
    const existingContact = await (prisma as any).saContact.findFirst({
      where: { companyId, email: primaryEmail },
    });
    if (!existingContact) {
      await (prisma as any).saContact.create({
        data: {
          companyId,
          email: primaryEmail,
          phone: crawl.phones[0] || null,
          isPrimary: true,
        },
      });
    }
  }

  if (!crawl.success && !crawl.textSample) {
    await saLog({
      level: 'warn',
      category: 'ai',
      action: 'analyze_skipped_crawl_fail',
      message: `Crawl failed for company ${companyId}`,
      entityType: 'SaLeadCompany',
      entityId: companyId,
      success: false,
    });
    return { companyId, crawlFailed: true };
  }

  const userContent = JSON.stringify({
    companyName: company.name,
    website: company.website,
    city: company.city,
    country: company.country,
    googleRating: company.googleRating,
    reviewCount: company.reviewCount,
    emails: crawl.emails,
    phones: crawl.phones,
    services: crawl.services,
    aboutSnippet: crawl.aboutSnippet,
    textSample: crawl.textSample.slice(0, 3500),
  });

  const result = await salesAgentChat(
    [
      { role: 'system', content: ANALYSIS_PROMPT },
      { role: 'user', content: userContent },
    ],
    { action: 'analyze_lead', jsonMode: true, companyId }
  );

  const parsed = parseJsonLoose<AnalysisFlags>(result.text);
  const leadScore = Math.max(0, Math.min(100, Number(parsed.leadScore) || 0));

  // Historical record — never overwrite prior analyses
  const analysis = await (prisma as any).saAiAnalysis.create({
    data: {
      companyId,
      provider: result.provider,
      model: result.model,
      needsTidyFlow: !!parsed.needsTidyFlow,
      hasBookingSoftware: !!parsed.hasBookingSoftware,
      hasClientPortal: !!parsed.hasClientPortal,
      hasSchedulingSoftware: !!parsed.hasSchedulingSoftware,
      hasInspectionMgmt: !!parsed.hasInspectionMgmt,
      hasStaffManagement: !!parsed.hasStaffManagement,
      websiteOutdated: !!parsed.websiteOutdated,
      leadScore,
      scoreReason: parsed.scoreReason || null,
      personalizedIntro: parsed.personalizedIntro || null,
      rawResponse: result.text,
      promptUsed: ANALYSIS_PROMPT,
      latencyMs: result.latencyMs,
    },
  });

  await (prisma as any).saLeadCompany.update({
    where: { id: companyId },
    data: {
      leadScore,
      status: 'ANALYZED',
      lastAnalyzedAt: new Date(),
    },
  });

  await saLog({
    category: 'ai',
    action: 'analyze_complete',
    message: `Analyzed ${company.name} score=${leadScore}`,
    entityType: 'SaLeadCompany',
    entityId: companyId,
    details: { provider: result.provider, leadScore },
  });

  return analysis;
}
