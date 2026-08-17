import prisma from '@/lib/prisma';
import PDFDocument from 'pdfkit';
import { uploadPDFToCloudinary } from '@/lib/cloudinary';
import { generateImmutableChecksum } from '@/lib/pdf-generator';
import { getAIConfig, isAIEnabled } from '@/lib/ai/config';
import { aiChat, parseJSONResponse } from '@/lib/ai/client';
import { logAIUsage } from '@/lib/subscription';
import {
  allocateInvoiceNumber,
  calcTotalsWithTax,
  getCompanyInvoiceSettings,
  resolveActiveTaxRule,
} from '@/lib/invoice-settings';
import { currencySymbol } from '@/lib/company-config';
import { getClientInvoicePdfLabels, invoiceDateLocale } from '@/lib/invoice-pdf-i18n';
import { registerPdfFonts, preparePdfText } from '@/lib/pdf-fonts';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

// ─── Colour palette ──────────────────────────────────────────────────────────
const NAVY        = '#0B1E3D';   // deep navy header / footer
const NAVY_MID    = '#162C52';   // slightly lighter navy accent band
const GOLD        = '#C9A84C';   // warm gold for highlights & dividers
const LIGHT_BG    = '#F4F7FB';   // very light blue-grey for alternating rows
const WHITE       = '#FFFFFF';
const TEXT_DARK   = '#1A1A2E';
const TEXT_MID    = '#4A5568';
const TEXT_LIGHT  = '#718096';

// ─── Helper utilities ─────────────────────────────────────────────────────────
function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function fillRect(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  hex: string,
) {
  doc.save().rect(x, y, w, h).fill(hex).restore();
}

// ─────────────────────────────────────────────────────────────────────────────

export async function generateInvoiceNumber(companyId: number): Promise<string> {
  return allocateInvoiceNumber(companyId);
}

/** Task budget takes priority; falls back to property default service rate. */
export function resolveInvoiceRate(
  task: { budget?: unknown | null },
  property?: { defaultServiceRate?: unknown | null } | null,
  customAmount?: number | null
): number {
  if (customAmount != null && Number(customAmount) > 0) return Number(customAmount);
  const budget = task.budget != null ? Number(task.budget) : 0;
  if (budget > 0) return budget;
  const propRate =
    property?.defaultServiceRate != null ? Number(property.defaultServiceRate) : 0;
  if (propRate > 0) return propRate;
  return 0;
}

export function assertInvoiceRate(rate: number) {
  if (!rate || rate <= 0) {
    throw new Error(
      'No price set for this task. Add a task budget or property default rate before creating an invoice.'
    );
  }
}

export async function buildLineItemsFromTask(
  taskId: number,
  options?: { useAI?: boolean; companyId?: number; customAmount?: number; locale?: string | null }
): Promise<InvoiceLineItem[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      property: true,
      company: { select: { name: true } },
    },
  });
  if (!task) throw new Error('Task not found');

  const rate = resolveInvoiceRate(task, task.property, options?.customAmount);
  assertInvoiceRate(rate);

  const defaultItems: InvoiceLineItem[] = [
    {
      description: `${task.title} — ${task.property.address}`,
      quantity: 1,
      unitPrice: rate,
      amount: rate,
    },
  ];

  if (!options?.useAI || !options.companyId) return defaultItems;

  const config = await getAIConfig(options.companyId);
  if (!isAIEnabled(config)) return defaultItems;

  try {
    const prompt = `You are a professional cleaning company billing assistant. Create itemized client invoice line items as a JSON array only.

Each object: {"description":"...","quantity":number,"unitPrice":number,"amount":number}
amount must equal quantity × unitPrice.

Job title: ${task.title}
${task.description ? `Scope: ${task.description}` : ''}
Property: ${task.property.address}
Property type: ${task.property.propertyType || 'residential'}
Target total (approx): ${rate}

Requirements:
- Return 2–4 separate line items (never a single generic line).
- Use client-facing descriptions (e.g. "Checkout turnover clean", "Kitchen & bathroom deep sanitization", "Cleaning consumables", "Parking / access fee" when relevant).
- Split labor vs materials/supplies when appropriate.
- All line amounts must sum to approximately ${rate} (within 5%).
- Quantities are usually 1 unless splitting hours/units makes sense.

Respond with JSON array only, no markdown.`;

    const result = await aiChat(
      [
        { role: 'system', content: 'Respond with JSON array only.' },
        { role: 'user', content: prompt },
      ],
      { companyId: options.companyId, jsonMode: true, locale: options.locale }
    );

    await logAIUsage(options.companyId, 'invoice_assist');
    const items = parseJSONResponse<InvoiceLineItem[]>(result.text);
    if (Array.isArray(items) && items.length > 0) {
      return items.map((i) => ({
        description: i.description,
        quantity: Number(i.quantity) || 1,
        unitPrice: Number(i.unitPrice) || rate,
        amount: Number(i.amount) || Number(i.unitPrice) * Number(i.quantity),
      }));
    }
  } catch {
    /* fallback */
  }

  return defaultItems;
}

export function calcInvoiceTotals(lineItems: InvoiceLineItem[], taxRate = 0) {
  const grossSubtotal = lineItems.reduce((s, i) => s + i.amount, 0);
  if (taxRate <= 0) {
    return {
      subtotal: Math.round(grossSubtotal * 100) / 100,
      taxAmount: 0,
      totalAmount: Math.round(grossSubtotal * 100) / 100,
    };
  }
  return calcTotalsWithTax(grossSubtotal, {
    id: 'legacy',
    name: 'Tax',
    percentage: taxRate,
    mode: 'exclusive',
    enabled: true,
    isDefault: true,
  });
}

export async function calcInvoiceTotalsForCompany(companyId: number, lineItems: InvoiceLineItem[]) {
  const settings = await getCompanyInvoiceSettings(companyId);
  const taxRule = resolveActiveTaxRule(settings);
  const grossSubtotal = lineItems.reduce((s, i) => s + i.amount, 0);
  return calcTotalsWithTax(grossSubtotal, taxRule);
}

/** Fetch company logo from Cloudinary URL for PDF embedding. */
export async function resolveInvoiceLogo(companyId: number): Promise<{
  logoBase64: string | null;
  logoMimeType: 'image/png' | 'image/jpeg' | null;
}> {
  const settings = await getCompanyInvoiceSettings(companyId);
  const url = settings?.logoUrl?.trim();
  if (!url) return { logoBase64: null, logoMimeType: null };

  try {
    const res = await fetch(url);
    if (!res.ok) return { logoBase64: null, logoMimeType: null };
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || '';
    const mime: 'image/png' | 'image/jpeg' =
      contentType.includes('jpeg') || /\.jpe?g($|\?)/i.test(url) ? 'image/jpeg' : 'image/png';
    return { logoBase64: buf.toString('base64'), logoMimeType: mime };
  } catch {
    return { logoBase64: null, logoMimeType: null };
  }
}

export async function buildInvoicePdfInput(
  invoice: {
    id: number;
    invoiceNumber: string;
    clientName: string;
    clientEmail?: string | null;
    clientAddress?: string | null;
    lineItems: InvoiceLineItem[];
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    dueDate?: Date | null;
    notes?: string | null;
    company: { name: string };
    task?: { title: string } | null;
    companyId?: number;
    logoBase64?: string | null;
    logoMimeType?: 'image/png' | 'image/jpeg' | null;
  }
) {
  let logoBase64 = invoice.logoBase64;
  let logoMimeType = invoice.logoMimeType;
  if (invoice.companyId && !logoBase64) {
    const logo = await resolveInvoiceLogo(invoice.companyId);
    logoBase64 = logo.logoBase64;
    logoMimeType = logo.logoMimeType;
  }
  return { ...invoice, logoBase64, logoMimeType };
}

// ─── MAIN IMPROVED FUNCTION ───────────────────────────────────────────────────
/**
 * Generates a premium navy-themed invoice PDF with optional company logo.
 *
 * Pass `logoBase64` (data-URL or raw base64 PNG/JPEG) and `logoMimeType`
 * alongside the existing invoice fields to render a logo in the header.
 *
 * All other parameters are unchanged from the original signature.
 */
export async function generateClientInvoicePDF(invoice: {
  id: number;
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string | null;
  clientAddress?: string | null;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  dueDate?: Date | null;
  notes?: string | null;
  company: { name: string };
  task?: { title: string } | null;
  companyId?: number;
  // ── Logo support (new, optional) ──────────────────────────────────────────
  /** Raw base64 string or data-URL for the company logo (PNG or JPEG). */
  logoBase64?: string | null;
  /** MIME type of the logo image. Defaults to 'image/png'. */
  logoMimeType?: 'image/png' | 'image/jpeg' | null;
}) {
  const settings = invoice.companyId
    ? await getCompanyInvoiceSettings(invoice.companyId)
    : null;

  let logoBase64 = invoice.logoBase64;
  let logoMimeType = invoice.logoMimeType;
  if (invoice.companyId && !logoBase64) {
    const logo = await resolveInvoiceLogo(invoice.companyId);
    logoBase64 = logo.logoBase64;
    logoMimeType = logo.logoMimeType;
  }

  const companyName = settings?.companyDisplayName || invoice.company.name;
  const labels = getClientInvoicePdfLabels(settings?.invoiceLanguage);
  const dateLocale = invoiceDateLocale(settings?.invoiceLanguage);
  const sym = currencySymbol(invoice.currency);

  const PAGE_W = 595.28; // A4 points
  const PAGE_H = 841.89;
  const MARGIN  = 50;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pdfLocale = settings?.invoiceLanguage;
    const fonts = registerPdfFonts(doc, pdfLocale);
    const pt = (s: string) => preparePdfText(s, pdfLocale);

    // ── 1. HEADER BAND ───────────────────────────────────────────────────────
    const HEADER_H = 140;
    fillRect(doc, 0, 0, PAGE_W, HEADER_H, NAVY);

    // Gold accent strip at bottom of header
    fillRect(doc, 0, HEADER_H - 4, PAGE_W, 4, GOLD);

    // Logo area (left side of header)
    const LOGO_X = MARGIN;
    const LOGO_Y = 22;
    const LOGO_MAX_W = 160;
    const LOGO_MAX_H = 80;

    if (logoBase64) {
      try {
        // Strip data-URL prefix if present
        const raw = logoBase64.includes(',')
          ? logoBase64.split(',')[1]
          : logoBase64;
        const imgBuffer = Buffer.from(raw, 'base64');
        doc.image(imgBuffer, LOGO_X, LOGO_Y, {
          fit: [LOGO_MAX_W, LOGO_MAX_H],
          valign: 'center',
        });
      } catch {
        // Logo failed – fall back to text
        doc
          .font(fonts.bold)
          .fontSize(20)
          .fillColor(WHITE)
          .text(pt(companyName), LOGO_X, LOGO_Y + 28, { width: LOGO_MAX_W });
      }
    } else {
      // No logo – render company name as bold white text
      doc
        .font(fonts.bold)
        .fontSize(20)
        .fillColor(WHITE)
        .text(pt(companyName), LOGO_X, LOGO_Y + 28, { width: LOGO_MAX_W });
    }

    // "INVOICE" label (right side of header)
    doc
      .font(fonts.bold)
      .fontSize(32)
      .fillColor(WHITE)
      .text(pt(labels.invoice), MARGIN, 30, { width: CONTENT_W, align: 'right' });

    doc
      .font(fonts.regular)
      .fontSize(11)
      .fillColor(GOLD)
      .text(invoice.invoiceNumber, MARGIN, 68, { width: CONTENT_W, align: 'right' });

    if (invoice.dueDate) {
      doc
        .font(fonts.regular)
        .fontSize(9)
        .fillColor(WHITE)
        .text(
          pt(`${labels.due}: ${new Date(invoice.dueDate).toLocaleDateString(dateLocale)}`),
          MARGIN, 88,
          { width: CONTENT_W, align: 'right' }
        );
    }

    // ── 2. INFO BAND (company details + Bill To) ──────────────────────────────
    const INFO_Y = HEADER_H + 8;
    const INFO_H = 110;
    const COL_W  = CONTENT_W / 2 - 8;

    // Left column – company info
    let cy = INFO_Y + 6;
    doc.font(fonts.bold).fontSize(9).fillColor(NAVY).text(pt(labels.from), MARGIN, cy);
    cy += 14;
    doc.font(fonts.bold).fontSize(11).fillColor(TEXT_DARK).text(pt(companyName), MARGIN, cy, { width: COL_W });
    cy += 16;
    doc.font(fonts.regular).fontSize(9).fillColor(TEXT_MID);
    if (settings?.address)              { doc.text(pt(settings.address),             MARGIN, cy, { width: COL_W }); cy += 12; }
    if (settings?.phone)                { doc.text(settings.phone,               MARGIN, cy, { width: COL_W }); cy += 12; }
    if (settings?.email)                { doc.text(settings.email,               MARGIN, cy, { width: COL_W }); cy += 12; }
    if (settings?.website)              { doc.text(settings.website,             MARGIN, cy, { width: COL_W }); cy += 12; }
    if (settings?.taxRegistrationNumber){ doc.text(pt(`${labels.taxId}: ${settings.taxRegistrationNumber}`), MARGIN, cy, { width: COL_W }); cy += 12; }

    // Right column – bill-to
    const RX = MARGIN + COL_W + 16;
    let ry = INFO_Y + 6;
    doc.font(fonts.bold).fontSize(9).fillColor(NAVY).text(pt(labels.billTo), RX, ry);
    ry += 14;
    doc.font(fonts.bold).fontSize(11).fillColor(TEXT_DARK).text(pt(invoice.clientName), RX, ry, { width: COL_W });
    ry += 16;
    doc.font(fonts.regular).fontSize(9).fillColor(TEXT_MID);
    if (invoice.clientEmail)   { doc.text(invoice.clientEmail,   RX, ry, { width: COL_W }); ry += 12; }
    if (invoice.clientAddress) { doc.text(pt(invoice.clientAddress), RX, ry, { width: COL_W }); ry += 12; }
    if (invoice.task?.title)   { doc.text(pt(`${labels.service}: ${invoice.task.title}`), RX, ry, { width: COL_W }); ry += 12; }

    // Thin gold separator beneath info band
    const SEP_Y = Math.max(cy, ry) + 14;
    fillRect(doc, MARGIN, SEP_Y, CONTENT_W, 2, GOLD);

    // ── 3. LINE-ITEMS TABLE ───────────────────────────────────────────────────
    const TBL_Y      = SEP_Y + 14;
    const COL = {
      desc:   { x: MARGIN,       w: 240 },
      qty:    { x: MARGIN + 244, w:  50 },
      price:  { x: MARGIN + 298, w:  80 },
      amount: { x: MARGIN + 382, w:  80 },
    };

    // Table header row background
    const TH_H = 26;
    fillRect(doc, MARGIN, TBL_Y, CONTENT_W, TH_H, NAVY_MID);

    doc.font(fonts.bold).fontSize(9).fillColor(WHITE);
    const th_cy = TBL_Y + 8;
    doc.text(pt(labels.description), COL.desc.x + 4,   th_cy, { width: COL.desc.w });
    doc.text(pt(labels.qty),         COL.qty.x,         th_cy, { width: COL.qty.w,   align: 'center' });
    doc.text(pt(labels.unitPrice),  COL.price.x,       th_cy, { width: COL.price.w, align: 'right'  });
    doc.text(pt(labels.amount),      COL.amount.x,      th_cy, { width: COL.amount.w,align: 'right'  });

    let rowY = TBL_Y + TH_H;

    invoice.lineItems.forEach((item, idx) => {
      const isEven   = idx % 2 === 0;
      const rowBg    = isEven ? WHITE : LIGHT_BG;
      const ROW_H    = 32;

      fillRect(doc, MARGIN, rowY, CONTENT_W, ROW_H, rowBg);

      // Left border accent on every row
      fillRect(doc, MARGIN, rowY, 3, ROW_H, NAVY);

      const textY = rowY + 10;
      doc.font(fonts.regular).fontSize(9).fillColor(TEXT_DARK);
      doc.text(pt(item.description), COL.desc.x + 8,   textY, { width: COL.desc.w - 8 });
      doc.text(String(item.quantity), COL.qty.x,   textY, { width: COL.qty.w,   align: 'center' });
      doc.text(`${sym}${item.unitPrice.toFixed(2)}`, COL.price.x, textY, { width: COL.price.w, align: 'right' });
      doc
        .font(fonts.bold)
        .text(`${sym}${item.amount.toFixed(2)}`, COL.amount.x, textY, { width: COL.amount.w, align: 'right' });

      rowY += ROW_H;
    });

    // Bottom border of table
    fillRect(doc, MARGIN, rowY, CONTENT_W, 2, GOLD);
    rowY += 2;

    // ── 4. TOTALS BLOCK ───────────────────────────────────────────────────────
    const TOT_X = MARGIN + COL.price.x - MARGIN - 20; // right-aligned block
    const TOT_W = COL.price.w + COL.amount.w + 20;
    const TOT_RIGHT_X = MARGIN + CONTENT_W - TOT_W;

    let totY = rowY + 16;

    const drawTotalRow = (label: string, value: string, bold = false, highlight = false) => {
      if (highlight) {
        fillRect(doc, TOT_RIGHT_X - 8, totY - 6, TOT_W + 8, 26, NAVY);
      }
      doc
        .font(bold ? fonts.bold : fonts.regular)
        .fontSize(bold && highlight ? 12 : 10)
        .fillColor(highlight ? WHITE : TEXT_MID);
      doc.text(pt(label), TOT_RIGHT_X, totY, { width: TOT_W * 0.55 });
      doc
        .font(bold ? fonts.bold : fonts.regular)
        .fontSize(bold && highlight ? 12 : 10)
        .fillColor(highlight ? GOLD : TEXT_DARK);
      doc.text(value, TOT_RIGHT_X, totY, { width: TOT_W, align: 'right' });
      totY += bold && highlight ? 28 : 22;
    };

    drawTotalRow(labels.subtotal, `${sym}${invoice.subtotal.toFixed(2)}`);
    if (invoice.taxRate > 0) {
      drawTotalRow(`${labels.tax} (${invoice.taxRate}%)`, `${sym}${invoice.taxAmount.toFixed(2)}`);
    }
    totY += 4;
    drawTotalRow(labels.totalDue, `${sym}${invoice.totalAmount.toFixed(2)}`, true, true);

    // ── 5. NOTES ─────────────────────────────────────────────────────────────
    if (invoice.notes) {
      const NOTES_Y = totY + 24;
      fillRect(doc, MARGIN, NOTES_Y, CONTENT_W, 22, LIGHT_BG);
      doc
        .font(fonts.bold)
        .fontSize(9)
        .fillColor(NAVY)
        .text(pt(labels.notes), MARGIN + 6, NOTES_Y + 6);
      doc
        .font(fonts.regular)
        .fontSize(9)
        .fillColor(TEXT_MID)
        .text(pt(invoice.notes), MARGIN + 6, NOTES_Y + 22, { width: CONTENT_W - 12 });
    }

    // ── 6. FOOTER BAND ────────────────────────────────────────────────────────
    const FOOTER_H = 40;
    const FOOTER_Y = PAGE_H - FOOTER_H;
    fillRect(doc, 0, FOOTER_Y, PAGE_W, FOOTER_H, NAVY);
    fillRect(doc, 0, FOOTER_Y, PAGE_W, 3, GOLD);

    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(TEXT_LIGHT)
      .text(
        pt(`${companyName}  •  ${invoice.invoiceNumber}  •  ${labels.thankYou}`),
        MARGIN,
        FOOTER_Y + 14,
        { width: CONTENT_W, align: 'center' }
      );

    doc.end();
  });

  const checksum = await generateImmutableChecksum(pdfBuffer);
  const upload   = await uploadPDFToCloudinary(pdfBuffer, invoice.id, checksum);
  if (!upload.success || !upload.secureUrl) {
    throw new Error(upload.error || 'PDF upload failed');
  }

  return upload.secureUrl;
}

// ─── Remaining functions unchanged ───────────────────────────────────────────

export async function regenerateClientInvoice(
  invoiceId: number,
  options?: { useAI?: boolean; voidPrevious?: boolean; createdById?: number; locale?: string | null }
) {
  const existing = await prisma.clientInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      task: { include: { property: true } },
      company: { select: { name: true } },
    },
  });
  if (!existing || !existing.taskId) throw new Error('Invoice or linked task not found');

  if (options?.voidPrevious) {
    await prisma.clientInvoice.update({
      where: { id: existing.id },
      data: { status: 'void' },
    });
  }

  const plan = await import('@/lib/subscription').then((m) => m.getCompanyPlan(existing.companyId));
  const canUseAI = options?.useAI && plan?.limits.aiInvoiceAssist;

  const lineItems = await buildLineItemsFromTask(existing.taskId, {
    useAI: canUseAI,
    companyId: existing.companyId,
    locale: options?.locale,
  });

  const { subtotal, taxRate, taxAmount, totalAmount } = await calcInvoiceTotalsForCompany(
    existing.companyId,
    lineItems
  );
  const invoiceNumber = await generateInvoiceNumber(existing.companyId);

  const invoice = await prisma.clientInvoice.create({
    data: {
      companyId: existing.companyId,
      taskId: existing.taskId,
      propertyId: existing.propertyId,
      invoiceNumber,
      clientName: existing.clientName,
      clientEmail: existing.clientEmail,
      clientPhone: existing.clientPhone,
      clientAddress: existing.clientAddress,
      lineItems: JSON.stringify(lineItems),
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      currency: existing.currency,
      notes: existing.notes,
      dueDate: existing.dueDate || new Date(Date.now() + 14 * 86400000),
      aiGenerated: !!canUseAI,
      createdById: options?.createdById || existing.createdById,
      status: 'draft',
    },
    include: {
      company: { select: { name: true } },
      task: { select: { title: true } },
    },
  });

  const pdfUrl = await generateClientInvoicePDF({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    clientAddress: invoice.clientAddress,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    currency: invoice.currency,
    dueDate: invoice.dueDate,
    notes: invoice.notes,
    company: invoice.company,
    task: invoice.task,
    companyId: existing.companyId,
  });

  return prisma.clientInvoice.update({
    where: { id: invoice.id },
    data: { pdfUrl },
  });
}