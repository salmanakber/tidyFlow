import { saLog } from './logger';

export interface CrawlResult {
  url: string;
  finalUrl: string;
  title: string | null;
  emails: string[];
  /** All candidate emails before strict ranking (for AI validation). */
  allEmailsFound: string[];
  phones: string[];
  socialLinks: string[];
  aboutPageUrl: string | null;
  contactPageUrl: string | null;
  aboutSnippet: string | null;
  services: string[];
  textSample: string;
  success: boolean;
  error?: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;
const SOCIAL_HOSTS = ['facebook.com', 'linkedin.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com'];

const CONTACT_PATH_HINTS = [
  '/contact',
  'contact-us',
  'contactus',
  'get-in-touch',
  'getintouch',
  'enquiry',
  'inquiry',
  'enquiries',
  'inquiries',
  'reach-us',
  'reachus',
  'support',
  'kontakt',
  'contatt',
  'contacto',
  'nous-contacter',
];

const ABOUT_PATH_HINTS = ['/about', 'about-us', 'our-story', 'who-we-are', 'ueber-uns', 'chi-siamo'];

/** Prefer real business inboxes over noreply / image assets */
const EMAIL_PRIORITY = [
  'info@',
  'hello@',
  'contact@',
  'office@',
  'admin@',
  'enquiries@',
  'enquiry@',
  'sales@',
  'bookings@',
  'booking@',
];

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]).slice(0, 200) : null;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const abs = new URL(match[1], baseUrl).toString();
      links.push(abs);
    } catch {
      /* skip */
    }
  }
  return links;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function filterEmails(emails: string[]): string[] {
  return unique(
    emails
      .map((e) => e.toLowerCase().replace(/^mailto:/i, ''))
      .filter(
        (e) =>
          !e.endsWith('.png') &&
          !e.endsWith('.jpg') &&
          !e.endsWith('.jpeg') &&
          !e.endsWith('.gif') &&
          !e.endsWith('.webp') &&
          !e.endsWith('.svg') &&
          !e.includes('example.com') &&
          !e.includes('sentry.io') &&
          !e.includes('wixpress.com') &&
          !e.includes('domain.com') &&
          !e.includes('email.com') &&
          !e.startsWith('noreply@') &&
          !e.startsWith('no-reply@') &&
          !e.startsWith('donotreply@') &&
          !e.includes('cloudflare')
      )
  );
}

function rankEmails(emails: string[]): string[] {
  const scored = filterEmails(emails).map((email) => {
    let score = 0;
    for (let i = 0; i < EMAIL_PRIORITY.length; i++) {
      if (email.startsWith(EMAIL_PRIORITY[i])) {
        score += 100 - i;
        break;
      }
    }
    if (email.includes('info') || email.includes('contact') || email.includes('hello')) score += 5;
    return { email, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.email).slice(0, 10);
}

function extractMailto(html: string): string[] {
  const found: string[] = [];
  const re = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) found.push(m[1]);
  return found;
}

function extractTel(html: string): string[] {
  const found: string[] = [];
  const re = /tel:([+\d()\s.-]{7,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) found.push(m[1].trim());
  return found;
}

function extractFooterHtml(html: string): string {
  const parts: string[] = [];
  const footerTag = html.match(/<footer[\s\S]*?<\/footer>/gi);
  if (footerTag) parts.push(...footerTag);

  const footerClass = html.match(
    /<(?:div|section|aside)[^>]*(?:id|class)=["'][^"']*(?:footer|site-footer|page-footer|bottom-bar)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|aside)>/gi
  );
  if (footerClass) parts.push(...footerClass.slice(0, 3));

  // Last ~15% of homepage often holds contact blocks when no <footer>
  if (!parts.length && html.length > 2000) {
    parts.push(html.slice(Math.floor(html.length * 0.85)));
  }
  return parts.join('\n');
}

function extractPhones(html: string): string[] {
  const fromTel = extractTel(html);
  const fromText = (html.match(PHONE_RE) || []).map((p) => p.trim());
  return unique(
    [...fromTel, ...fromText].filter((p) => {
      const digits = p.replace(/\D/g, '');
      return digits.length >= 8 && digits.length <= 15;
    })
  ).slice(0, 8);
}

function harvestContacts(html: string): { emails: string[]; phones: string[] } {
  if (!html) return { emails: [], phones: [] };
  const emails = [...extractMailto(html), ...(html.match(EMAIL_RE) || [])];
  return { emails, phones: extractPhones(html) };
}

async function fetchPage(url: string, timeoutMs = 15000): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TidyFlowSalesAgent/1.0; +https://tidyflowapp.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    const html = await res.text();
    return { html: html.slice(0, 500_000), finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function findSubpage(links: string[], keywords: string[]): string | null {
  const lower = keywords.map((k) => k.toLowerCase());
  // Prefer shorter, clearer contact URLs
  const scored = links
    .map((link) => {
      const l = link.toLowerCase();
      const hit = lower.findIndex((k) => l.includes(k));
      if (hit < 0) return null;
      return { link, score: 100 - hit - Math.min(40, link.length / 10) };
    })
    .filter(Boolean) as { link: string; score: number }[];
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.link || null;
}

export async function crawlWebsite(websiteUrl: string): Promise<CrawlResult> {
  let url = websiteUrl.trim();
  if (!url.startsWith('http')) url = `https://${url}`;

  const started = Date.now();
  const primary = await fetchPage(url);
  if (!primary) {
    await saLog({
      level: 'warn',
      category: 'crawl',
      action: 'crawl_failed',
      message: `Failed to fetch ${url}`,
      success: false,
      durationMs: Date.now() - started,
    });
    return {
      url,
      finalUrl: url,
      title: null,
      emails: [],
      allEmailsFound: [],
      phones: [],
      socialLinks: [],
      aboutPageUrl: null,
      contactPageUrl: null,
      aboutSnippet: null,
      services: [],
      textSample: '',
      success: false,
      error: 'Failed to fetch website',
    };
  }

  const links = extractLinks(primary.html, primary.finalUrl);
  const contactPageUrl = findSubpage(links, CONTACT_PATH_HINTS);
  const aboutPageUrl = findSubpage(links, ABOUT_PATH_HINTS);

  let contactHtml = '';
  let aboutHtml = '';
  if (contactPageUrl) {
    const page = await fetchPage(contactPageUrl);
    if (page) contactHtml = page.html;
  }
  // If no dedicated contact page, try common paths directly
  if (!contactHtml) {
    for (const path of ['/contact', '/contact-us', '/contactus', '/get-in-touch', '/enquiry']) {
      try {
        const candidate = new URL(path, primary.finalUrl).toString();
        const page = await fetchPage(candidate);
        if (page?.html && (extractMailto(page.html).length || (page.html.match(EMAIL_RE) || []).length)) {
          contactHtml = page.html;
          break;
        }
      } catch {
        /* skip */
      }
    }
  }
  if (aboutPageUrl) {
    const page = await fetchPage(aboutPageUrl);
    if (page) aboutHtml = page.html;
  }

  const footerHtml = extractFooterHtml(primary.html);

  // Priority: contact page → footer → homepage → about
  const contactHits = harvestContacts(contactHtml);
  const footerHits = harvestContacts(footerHtml);
  const homeHits = harvestContacts(primary.html);
  const aboutHits = harvestContacts(aboutHtml);

  const rawEmails = unique([
    ...contactHits.emails,
    ...footerHits.emails,
    ...homeHits.emails,
    ...aboutHits.emails,
  ]);
  const emails = rankEmails(rawEmails);
  const phones = unique([
    ...contactHits.phones,
    ...footerHits.phones,
    ...homeHits.phones,
    ...aboutHits.phones,
  ]).slice(0, 8);

  const socialLinks = unique(
    links.filter((l) => SOCIAL_HOSTS.some((h) => l.toLowerCase().includes(h)))
  ).slice(0, 10);

  const combined = `${contactHtml}\n${footerHtml}\n${primary.html}\n${aboutHtml}`;
  const text = stripTags(combined).slice(0, 8000);
  const aboutSnippet = aboutHtml ? stripTags(aboutHtml).slice(0, 1500) : text.slice(0, 800);

  const serviceKeywords = [
    'commercial cleaning',
    'office cleaning',
    'domestic cleaning',
    'janitorial',
    'deep clean',
    'end of tenancy',
    'carpet cleaning',
    'window cleaning',
    'industrial cleaning',
  ];
  const services = serviceKeywords.filter((k) => text.toLowerCase().includes(k));

  await saLog({
    category: 'crawl',
    action: 'crawl_complete',
    message: `Crawled ${url}: ${emails.length} emails (contact=${contactHits.emails.length}, footer=${footerHits.emails.length})`,
    durationMs: Date.now() - started,
    entityType: 'website',
    entityId: url,
  });

  return {
    url,
    finalUrl: primary.finalUrl,
    title: extractTitle(primary.html),
    emails,
    allEmailsFound: filterEmails(rawEmails).slice(0, 25),
    phones,
    socialLinks,
    aboutPageUrl,
    contactPageUrl: contactPageUrl || null,
    aboutSnippet,
    services,
    textSample: text.slice(0, 4000),
    success: true,
  };
}
