import { saLog } from './logger';

export interface CrawlResult {
  url: string;
  finalUrl: string;
  title: string | null;
  emails: string[];
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
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;
const SOCIAL_HOSTS = ['facebook.com', 'linkedin.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com'];

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
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
      .map((e) => e.toLowerCase())
      .filter(
        (e) =>
          !e.endsWith('.png') &&
          !e.endsWith('.jpg') &&
          !e.includes('example.com') &&
          !e.includes('sentry.io') &&
          !e.includes('wixpress.com')
      )
  ).slice(0, 10);
}

async function fetchPage(url: string, timeoutMs = 15000): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TidyFlowSalesAgent/1.0; +https://tidyflowapp.com)',
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
  for (const link of links) {
    const l = link.toLowerCase();
    if (lower.some((k) => l.includes(k))) return link;
  }
  return null;
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
  const contactPageUrl = findSubpage(links, ['/contact', 'contact-us', 'get-in-touch', 'enquiry', 'inquiry']);
  const aboutPageUrl = findSubpage(links, ['/about', 'about-us', 'our-story', 'who-we-are']);

  let contactHtml = '';
  let aboutHtml = '';
  if (contactPageUrl) {
    const page = await fetchPage(contactPageUrl);
    if (page) contactHtml = page.html;
  }
  if (aboutPageUrl) {
    const page = await fetchPage(aboutPageUrl);
    if (page) aboutHtml = page.html;
  }

  const combined = `${primary.html}\n${contactHtml}\n${aboutHtml}`;
  const emails = filterEmails(combined.match(EMAIL_RE) || []);
  const phones = unique((combined.match(PHONE_RE) || []).map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 8)).slice(0, 8);
  const socialLinks = unique(
    links.filter((l) => SOCIAL_HOSTS.some((h) => l.toLowerCase().includes(h)))
  ).slice(0, 10);

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
    message: `Crawled ${url}: ${emails.length} emails`,
    durationMs: Date.now() - started,
    entityType: 'website',
    entityId: url,
  });

  return {
    url,
    finalUrl: primary.finalUrl,
    title: extractTitle(primary.html),
    emails,
    phones,
    socialLinks,
    aboutPageUrl,
    contactPageUrl,
    aboutSnippet,
    services,
    textSample: text.slice(0, 4000),
    success: true,
  };
}
