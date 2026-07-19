/**
 * Canonical TidyFlow product knowledge for Sales Agent AI
 * (templates, lead analysis, personalized intros, feature mentions).
 */

export const TIDYFLOW_PRODUCT_NAME = 'TidyFlow';

/** Short one-liner for prompts */
export const TIDYFLOW_ONE_LINER =
  'TidyFlow is an operations platform for cleaning and facilities companies — scheduling, staff, inspections, client communication, GPS proof of work, and payroll in one place.';

/**
 * Features the AI may accurately mention. Prefer plain language over jargon.
 * When the user asks for "this and that feature", map their words to these.
 */
export const TIDYFLOW_FEATURES: Array<{
  id: string;
  name: string;
  aliases: string[];
  blurb: string;
}> = [
  {
    id: 'scheduling',
    name: 'Job scheduling & calendar',
    aliases: ['schedule', 'calendar', 'dispatch', 'bookings', 'jobs', 'roster'],
    blurb: 'Plan and assign cleaning jobs on a shared calendar; avoid double-booking and missed visits.',
  },
  {
    id: 'staff',
    name: 'Staff & cleaner management',
    aliases: ['staff', 'cleaners', 'team', 'employees', 'workforce'],
    blurb: 'Manage cleaners, roles, and assignments so the right person is on the right job.',
  },
  {
    id: 'checklists',
    name: 'Checklists & task templates',
    aliases: ['checklist', 'tasks', 'sop', 'quality list'],
    blurb: 'Reusable room/area checklists so every clean follows the same standard.',
  },
  {
    id: 'inspections',
    name: 'Inspections & quality control',
    aliases: ['inspection', 'qa', 'quality', 'audit'],
    blurb: 'Run inspections, catch issues early, and keep quality consistent across sites.',
  },
  {
    id: 'photo_proof',
    name: 'Photo proof of work',
    aliases: ['photos', 'proof', 'before after', 'evidence'],
    blurb: 'Cleaners can attach photos as proof the job was done to standard.',
  },
  {
    id: 'gps',
    name: 'GPS tracking & on-site proof',
    aliases: ['gps', 'location', 'tracking', 'geofence', 'clock in'],
    blurb: 'GPS check-in / location proof so you know cleaners arrived and worked on site.',
  },
  {
    id: 'time_hours',
    name: 'Time tracking & hours',
    aliases: ['hours', 'time', 'timesheet', 'clock'],
    blurb: 'Track work sessions and hours for payroll accuracy and job costing.',
  },
  {
    id: 'client_portal',
    name: 'Client portal',
    aliases: ['portal', 'client login', 'customer access'],
    blurb: 'Give clients a portal to see jobs, status, and communication without endless email chains.',
  },
  {
    id: 'client_invoices',
    name: 'Client invoices & billing',
    aliases: ['invoice', 'billing', 'invoicing', 'payments'],
    blurb: 'Create and track client invoices tied to completed work.',
  },
  {
    id: 'reviews',
    name: 'Client reviews & feedback',
    aliases: ['reviews', 'feedback', 'ratings'],
    blurb: 'Collect client feedback and reviews after jobs to build trust and catch problems.',
  },
  {
    id: 'chat',
    name: 'In-app chat & team messaging',
    aliases: ['chat', 'messages', 'communication'],
    blurb: 'Keep job-related team chat in one place instead of scattered WhatsApp threads.',
  },
  {
    id: 'announcements',
    name: 'Announcements',
    aliases: ['announce', 'broadcast', 'company news'],
    blurb: 'Send announcements to staff so everyone sees important updates.',
  },
  {
    id: 'properties',
    name: 'Properties / sites',
    aliases: ['properties', 'sites', 'locations', 'buildings'],
    blurb: 'Organize multi-site cleaning with property records, notes, and recurring jobs.',
  },
  {
    id: 'recurring',
    name: 'Recurring jobs',
    aliases: ['recurring', 'repeat', 'weekly clean'],
    blurb: 'Set recurring cleans so regular contracts renew on the calendar automatically.',
  },
  {
    id: 'supplies',
    name: 'Supplies & packing lists',
    aliases: ['supplies', 'inventory', 'stock', 'packing'],
    blurb: 'Track supplies and packing lists so crews arrive prepared.',
  },
  {
    id: 'payroll',
    name: 'Payroll & hours runs',
    aliases: ['payroll', 'pay', 'wages'],
    blurb: 'Turn tracked hours into cleaner payroll runs with less spreadsheet work.',
  },
  {
    id: 'analytics',
    name: 'Analytics & AI insights',
    aliases: ['analytics', 'reports', 'dashboard', 'ai insights'],
    blurb: 'See performance, gaps, and AI-assisted recommendations for operations.',
  },
  {
    id: 'mobile',
    name: 'Mobile app for cleaners & managers',
    aliases: ['mobile', 'app', 'phone', 'ios', 'android'],
    blurb: 'Cleaners and managers run the day from mobile — jobs, GPS, photos, chat.',
  },
  {
    id: 'sos',
    name: 'SOS / safety alerts',
    aliases: ['sos', 'safety', 'emergency'],
    blurb: 'SOS alerts help protect field staff when something goes wrong on site.',
  },
  {
    id: 'multilang',
    name: 'Multi-language support',
    aliases: ['language', 'translation', 'multilingual'],
    blurb: 'Work in multiple languages so mixed teams stay aligned.',
  },
];

export function tidyflowFeaturesForPrompt(): string {
  return TIDYFLOW_FEATURES.map(
    (f) => `- ${f.name} (aka: ${f.aliases.slice(0, 4).join(', ')}): ${f.blurb}`
  ).join('\n');
}

/**
 * Default email HTML design when the user does not override with a custom look.
 * Goal: looks like a real person wrote it — not a marketing landing page.
 */
export const DEFAULT_EMAIL_HTML_DESIGN = `
DEFAULT LOOK (use this unless the user clearly asks for something else):
- Looks like a simple email a human typed — NOT a SaaS landing page, NOT a newsletter blast
- Single column, white background, normal readable body text
- Short paragraphs (2–4), conversational B2B tone
- Greeting + 1–2 short value points (only real TidyFlow features if mentioned) + soft close
- ONE primary CTA only: a single text link OR one simple button at the BOTTOM after the body text
- CTA links to {{booking_link}} (or plain URL text if needed)
- Sign-off with {{sender_name}}
- Inline styles only; email-client safe (tables ok if needed for the button)
- No hero images, no multi-column layouts, no card grids, no purple gradients, no icon rows, no fake stats
- Brand colors only if user asks: navy #0D1E36 text, amber #D97706 for the single CTA button
- Max width ~560–600px centered is fine; otherwise plain left-aligned text is better
`.trim();

export function buildTemplateGenerationSystemPrompt(opts: {
  followUps: number;
  language: string;
  country?: string;
}): string {
  return `You write B2B cold emails for ${TIDYFLOW_PRODUCT_NAME}.

PRODUCT (know this — mention features accurately when the user asks):
${TIDYFLOW_ONE_LINER}

Feature catalog (use exact product capabilities; do not invent features):
${tidyflowFeaturesForPrompt()}

When the user names features ("GPS", "client portal", "payroll", etc.), map to the catalog above and describe them naturally in 1 short phrase each. Never invent competitors or fake modules.

Return JSON only:
{
  "name": "short pack name",
  "subject": "email subject — may use merge tags",
  "htmlBody": "full HTML email body",
  "textBody": "plain text fallback matching the HTML",
  "stepLabel": "Day 0 · Initial",
  "children": []
}

MERGE TAGS (only these): {{company_name}} {{contact_name}} {{city}} {{website}} {{services}} {{personalized_intro}} {{sender_name}} {{booking_link}}

DESIGN RULES (critical — previous outputs looked weird because they ignored these):
1. Obey the user's htmlDesignRequest EXACTLY when they specify layout/colors/structure.
2. If their design request is vague or empty of specifics, apply the DEFAULT LOOK below.
3. ${DEFAULT_EMAIL_HTML_DESIGN}
4. htmlBody must be complete, valid-enough HTML for email (wrap in a simple body/div). Prefer <p> tags and one CTA at the end.
5. Example CTA pattern (adapt colors only if user asked):
   <p style="margin:24px 0 8px 0;">
     <a href="{{booking_link}}" style="display:inline-block;background:#D97706;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;font-family:Arial,Helvetica,sans-serif;font-size:14px;">Book a quick demo</a>
   </p>
6. Do NOT produce: giant headers, multiple buttons, sidebar, social icon bars, unsubscribe footers that look like Mailchimp blasts, Lorem ipsum, or purple AI-looking themes.

CONTENT RULES:
- Professional, concise, cleaning-industry relevant
- Include exactly ${opts.followUps} follow-up children (escalating delayDays). If 0, children = []
- Language hint: ${opts.language}${opts.country ? `; country focus: ${opts.country}` : ''}
- Follow-ups should be shorter and reference the first email; same simple design; still one CTA only`.trim();
}
