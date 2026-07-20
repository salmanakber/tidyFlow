import prisma from '@/lib/prisma';
import { crawlWebsite } from './crawler';
import { salesAgentChat, parseJsonLoose } from './ai-provider';
import { saLog } from './logger';
import { TIDYFLOW_ONE_LINER, tidyflowFeaturesForPrompt } from './product-knowledge';

function uniqueEmails(list: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      list
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e.includes('@'))
    )
  );
}

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

const ANALYSIS_PROMPT = `You are evaluating cleaning / facilities companies as potential customers for TidyFlow.

${TIDYFLOW_ONE_LINER}

TidyFlow features (use when writing personalizedIntro — only real capabilities):
${tidyflowFeaturesForPrompt()}

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
  "personalizedIntro": "one personalized outreach sentence mentioning their company; optionally hint one relevant TidyFlow capability (scheduling, GPS proof, client portal, etc.) without inventing features"
}

Higher scores: established cleaning company, outdated tech, no clear ops software, commercial/office focus.
Lower scores: already using competitor software, not a cleaning business, personal blog, or agency.`;

const EMAIL_PICK_PROMPT = `You validate contact emails found on a cleaning / janitorial company website.

Return JSON only:
{
  "primaryEmail": "best business outreach email or null",
  "validEmails": ["all emails worth keeping for outreach"],
  "rejected": [{"email":"...", "reason":"short reason"}]
}

Rules:
- Prefer info@, contact@, hello@, office@, sales@ on the company's own domain.
- Reject noreply, donotreply, no-reply, mailer-daemon, sentry, wixpress, example.com, placeholder emails.
- Reject directory/platform emails (yelp, yellowpages, wordpress.com admin unless clearly theirs).
- If a matching domain email exists, reject unrelated personal gmail/yahoo unless clearly the owner.
- If none are valid business contacts, set primaryEmail to null and validEmails to [].`;

async function pickValidEmailWithAi(input: {
  companyName: string;
  website: string;
  emails: string[];
  companyId: number;
}): Promise<{ primaryEmail: string | null; validEmails: string[] }> {
  const candidates = Array.from(
    new Set(input.emails.map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes('@')))
  );
  if (!candidates.length) return { primaryEmail: null, validEmails: [] };
  if (candidates.length === 1) {
    return { primaryEmail: candidates[0], validEmails: candidates };
  }

  try {
    const result = await salesAgentChat(
      [
        { role: 'system', content: EMAIL_PICK_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            companyName: input.companyName,
            website: input.website,
            emails: candidates,
          }),
        },
      ],
      { action: 'pick_lead_email', jsonMode: true, companyId: input.companyId }
    );
    const parsed = parseJsonLoose<{
      primaryEmail?: string | null;
      validEmails?: string[];
    }>(result.text);
    const validEmails = (parsed.validEmails || [])
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => e.includes('@') && candidates.includes(e));
    let primaryEmail = parsed.primaryEmail
      ? String(parsed.primaryEmail).trim().toLowerCase()
      : null;
    if (primaryEmail && !candidates.includes(primaryEmail)) primaryEmail = null;
    if (!primaryEmail && validEmails.length) primaryEmail = validEmails[0];
    if (!validEmails.length && primaryEmail) return { primaryEmail, validEmails: [primaryEmail] };
    return { primaryEmail, validEmails };
  } catch (err: any) {
    await saLog({
      level: 'warn',
      category: 'ai',
      action: 'email_pick_fallback',
      message: err.message || 'AI email pick failed — using ranked crawl order',
      entityType: 'SaLeadCompany',
      entityId: input.companyId,
      success: false,
    });
    return { primaryEmail: candidates[0], validEmails: candidates.slice(0, 5) };
  }
}

export async function analyzeLeadCompany(companyId: number): Promise<any> {
  const company = await (prisma as any).saLeadCompany.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('Lead company not found');
  if (!company.website) {
    await (prisma as any).saLeadCompany.update({
      where: { id: companyId },
      data: {
        crawlStatus: 'skipped_no_website',
        crawlError: 'No website on listing',
        lastCrawledAt: new Date(),
      },
    });
    await saLog({
      level: 'info',
      category: 'ai',
      action: 'analyze_skipped_no_website',
      message: `Skipped ${company.name} — no website`,
      entityType: 'SaLeadCompany',
      entityId: companyId,
    });
    return { companyId, skipped: true, reason: 'no_website' };
  }

  await (prisma as any).saLeadCompany.update({
    where: { id: companyId },
    data: { crawlStatus: 'analyzing' },
  }).catch(() => {});

  const crawl = await crawlWebsite(company.website);
  const emailCandidates = uniqueEmails([
    ...(crawl.allEmailsFound || []),
    ...crawl.emails,
    company.email,
  ]);
  const picked = await pickValidEmailWithAi({
    companyName: company.name,
    website: company.website,
    emails: emailCandidates,
    companyId,
  });
  const primaryEmail = picked.primaryEmail;

  // No usable email after crawl → remove lead (we only keep contactable companies)
  if (!primaryEmail) {
    await saLog({
      level: 'info',
      category: 'ai',
      action: 'analyze_deleted_no_email',
      message: `Deleted ${company.name} — no visible email on site/contact/footer`,
      entityType: 'SaLeadCompany',
      entityId: companyId,
      details: { website: company.website, crawlOk: crawl.success },
    });
    await (prisma as any).saLeadCompany.delete({ where: { id: companyId } });
    return {
      companyId,
      deleted: true,
      reason: 'no_email',
      message: 'No email found on website (contact page / footer). Lead removed.',
    };
  }

  await (prisma as any).saLeadCompany.update({
    where: { id: companyId },
    data: {
      email: primaryEmail,
      phone: crawl.phones[0] || company.phone,
      hasEmail: true,
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

  for (const alt of picked.validEmails) {
    if (alt === primaryEmail) continue;
    const exists = await (prisma as any).saContact.findFirst({
      where: { companyId, email: alt },
    });
    if (!exists) {
      await (prisma as any).saContact.create({
        data: {
          companyId,
          email: alt,
          phone: crawl.phones[0] || null,
          isPrimary: false,
        },
      });
    }
  }

  if (!crawl.success && !crawl.textSample) {
    await saLog({
      level: 'warn',
      category: 'ai',
      action: 'analyze_skipped_crawl_fail',
      message: `Crawl failed for company ${companyId} (email kept from prior data)`,
      entityType: 'SaLeadCompany',
      entityId: companyId,
      success: false,
    });
    return { companyId, crawlFailed: true, email: primaryEmail };
  }

  const userContent = JSON.stringify({
    companyName: company.name,
    website: company.website,
    city: company.city,
    country: company.country,
    googleRating: company.googleRating,
    reviewCount: company.reviewCount,
    emails: emailCandidates,
    validEmails: picked.validEmails,
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
    details: { provider: result.provider, leadScore, email: primaryEmail },
  });

  return analysis;
}
