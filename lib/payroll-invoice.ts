import PDFDocument from 'pdfkit';
import prisma from '@/lib/prisma';
import { allocatePayrollNumber, getCompanyInvoiceSettings } from '@/lib/invoice-settings';
import { resolveInvoiceLogo } from '@/lib/client-invoice';
import { uploadPDFToCloudinary } from '@/lib/cloudinary';
import { getCompanyCurrency, currencySymbol } from '@/lib/company-config';
import { getPayslipPdfLabels, getPayslipLineLabels, formatPayslipLine, invoiceDateLocale } from '@/lib/invoice-pdf-i18n';
import { registerPdfFonts, preparePdfText, type PdfFontSet } from '@/lib/pdf-fonts';
import crypto from 'crypto';

async function payrollPdfChecksum(pdfBuffer: Buffer): Promise<string> {
  return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
}

export type PayrollPdfResult = {
  success: boolean;
  pdfUrl?: string;
  pdfBuffer?: Buffer;
  checksum?: string;
  error?: string;
  generatedAt: Date;
};

// ─── THEMATIC DESIGN TOKENS (SaaS Editorial Palette) ─────────────────────────
const NAVY = '#0F172A';          // slate-900 (Primary Brand)
const NAVY_MID = '#1E293B';      // slate-800 (Table Headers)
const GOLD = '#D97706';          // amber-600 (Gold Accent Highlights)
const ROSE = '#EF4444';          // red-500 (Deduction Indicators)
const WHITE = '#FFFFFF';
const TEXT_DARK = '#0F172A';     // Primary Copy
const TEXT_MID = '#475569';      // Secondary/Label Copy
const TEXT_LIGHT = '#94A3B8';    // Faint Monospace/Hashes
const LIGHT_BG = '#F8FAFC';      // Alternating row shade (slate-50)
const BORDER_SLATE = '#E2E8F0';  // Clean Dividers (slate-200)

const PAGE_W = 595.28;           // A4 Width
const PAGE_H = 841.89;           // A4 Height
const MARGIN = 45;
const CONTENT_W = PAGE_W - MARGIN * 2;

function fillRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, hex: string) {
  doc.save().rect(x, y, w, h).fill(hex).restore();
}

async function fetchPeriodShiftBreakdown(
  userId: number,
  periodStart: Date,
  periodEnd: Date,
  generalHoursLabel: string
): Promise<{ date: Date; hours: number; label: string }[]> {
  const rows = await prisma.workingHoursSubmission.findMany({
    where: {
      userId,
      date: { gte: periodStart, lte: periodEnd },
      status: { in: ['approved', 'paid', 'locked'] },
    },
    include: {
      tasks: { include: { task: { select: { title: true } } } },
    },
    orderBy: { date: 'asc' },
  });

  return rows.map((r) => {
    const taskTitles = r.tasks.map((t) => t.task?.title).filter(Boolean).join(', ');
    const label = taskTitles || generalHoursLabel;
    return { date: r.date, hours: Number(r.hours), label };
  });
}

// ─── CLEAN MODULAR TABLE RENDERERS ───────────────────────────────────────────
function drawTableSectionHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  startY: number,
  amountLabel = 'Amount',
  fonts: PdfFontSet = { regular: 'Helvetica', bold: 'Helvetica-Bold', rtl: false },
  locale = 'en'
): number {
  const h = 20;
  fillRect(doc, MARGIN, startY, CONTENT_W, h, NAVY_MID);
  
  doc.font(fonts.bold).fontSize(8.5).fillColor(WHITE);
  doc.text(preparePdfText(title, locale), MARGIN + 10, startY + 6, { width: CONTENT_W - 120 });
  doc.text(preparePdfText(amountLabel, locale), MARGIN + CONTENT_W - 100, startY + 6, { width: 90, align: 'right' });
  
  return startY + h;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  label: string,
  amountStr: string,
  isEven: boolean,
  startY: number,
  isDeduction = false,
  fonts: PdfFontSet = { regular: 'Helvetica', bold: 'Helvetica-Bold', rtl: false },
  locale = 'en'
): number {
  const h = 18;
  if (isEven) {
    fillRect(doc, MARGIN, startY, CONTENT_W, h, LIGHT_BG);
  }
  
  doc.font(fonts.regular).fontSize(8.5).fillColor(TEXT_DARK);
  doc.text(preparePdfText(label, locale), MARGIN + 10, startY + 5, { width: CONTENT_W - 120, lineBreak: false });
  
  doc.font(fonts.bold).fontSize(8.5).fillColor(isDeduction ? ROSE : TEXT_DARK);
  doc.text(amountStr, MARGIN + CONTENT_W - 100, startY + 5, { width: 90, align: 'right' });
  
  doc.save()
     .moveTo(MARGIN, startY + h)
     .lineTo(MARGIN + CONTENT_W, startY + h)
     .lineWidth(0.5)
     .strokeColor(BORDER_SLATE)
     .stroke()
     .restore();
     
  return startY + h;
}

function drawTableSubtotalRow(
  doc: PDFKit.PDFDocument,
  label: string,
  amountStr: string,
  startY: number,
  fonts: PdfFontSet = { regular: 'Helvetica', bold: 'Helvetica-Bold', rtl: false },
  locale = 'en'
): number {
  const h = 20;
  doc.font(fonts.bold).fontSize(8.5).fillColor(TEXT_DARK);
  doc.text(preparePdfText(label, locale), MARGIN + 10, startY + 6, { width: CONTENT_W - 120 });
  doc.text(amountStr, MARGIN + CONTENT_W - 100, startY + 6, { width: 90, align: 'right' });
  
  doc.save()
     .moveTo(MARGIN, startY + h)
     .lineTo(MARGIN + CONTENT_W, startY + h)
     .lineWidth(1)
     .strokeColor(NAVY)
     .stroke()
     .restore();
     
  return startY + h;
}

export async function generatePayrollInvoicePDF(
  payrollRecord: {
    id: number;
    userId: number;
    companyId: number;
    user: { firstName: string | null; lastName: string | null; email: string };
    company: { name: string };
    periodStart: Date;
    periodEnd: Date;
    payrollType: string;
    hoursWorked: number | null;
    hourlyRate: number | null;
    fixedSalary: number | null;
    grossSalary?: number | null;
    totalDeductions?: number | null;
    totalAmount: number;
    status: string;
    paidAt: Date | null;
    paymentMethod?: string | null;
    hraAllowance?: number | null;
    transportAllowance?: number | null;
    bonus?: number | null;
    otherAllowances?: number | null;
    overtimeAmount?: number | null;
    incomeTax?: number | null;
    socialSecurity?: number | null;
    insurance?: number | null;
    loanRepayment?: number | null;
    otherDeductions?: number | null;
  },
  options?: { invoiceNumber?: string; currency?: string }
): Promise<PayrollPdfResult> {
  try {
    const settings = await getCompanyInvoiceSettings(payrollRecord.companyId);
    const companyName = settings.companyDisplayName || payrollRecord.company.name;
    const invoiceNumber = options?.invoiceNumber || (await allocatePayrollNumber(payrollRecord.companyId));
    const currency = options?.currency || (await getCompanyCurrency(payrollRecord.companyId));
    const sym = currencySymbol(currency);
    const labels = getPayslipPdfLabels(settings.invoiceLanguage);
    const lineLabels = getPayslipLineLabels(settings.invoiceLanguage);
    const dateLocale = invoiceDateLocale(settings.invoiceLanguage);
    const pt = (s: string) => preparePdfText(s, settings.invoiceLanguage);

    const employeeName =
      `${payrollRecord.user.firstName || ''} ${payrollRecord.user.lastName || ''}`.trim() || labels.employee;

    const shiftBreakdown = await fetchPeriodShiftBreakdown(
      payrollRecord.userId,
      payrollRecord.periodStart,
      payrollRecord.periodEnd,
      lineLabels.generalHours
    );

    const lineItems: { description: string; amount: number }[] = [];
    if (payrollRecord.payrollType === 'fixed') {
      lineItems.push({
        description: lineLabels.fixedSalaryPeriod,
        amount: Number(payrollRecord.fixedSalary || payrollRecord.grossSalary || payrollRecord.totalAmount),
      });
    } else {
      const hrs = Number(payrollRecord.hoursWorked || 0);
      const rate = Number(payrollRecord.hourlyRate || 0);
      lineItems.push({
        description: formatPayslipLine(lineLabels.periodEarnings, {
          hours: hrs.toFixed(2),
          sym,
          rate: rate.toFixed(2),
        }),
        amount: hrs * rate || Number(payrollRecord.grossSalary || payrollRecord.totalAmount),
      });
    }
    if (payrollRecord.overtimeAmount && Number(payrollRecord.overtimeAmount) > 0) {
      lineItems.push({ description: labels.overtime, amount: Number(payrollRecord.overtimeAmount) });
    }

    const dbRecord = await prisma.payrollRecord.findUnique({
      where: { id: payrollRecord.id },
      include: { lineItems: { orderBy: { id: 'asc' } } },
    });
    if (dbRecord?.lineItems?.length) {
      for (const li of dbRecord.lineItems) {
        if (li.type === 'allowance') {
          const tag = li.isRecurring ? '' : lineLabels.oneTime;
          lineItems.push({ description: `${li.name}${tag}`, amount: Number(li.amount) });
        }
      }
    } else {
      if (payrollRecord.hraAllowance && Number(payrollRecord.hraAllowance) > 0) {
        lineItems.push({ description: lineLabels.hraAllowance, amount: Number(payrollRecord.hraAllowance) });
      }
      if (payrollRecord.transportAllowance && Number(payrollRecord.transportAllowance) > 0) {
        lineItems.push({ description: lineLabels.transportAllowance, amount: Number(payrollRecord.transportAllowance) });
      }
      if (payrollRecord.bonus && Number(payrollRecord.bonus) > 0) {
        lineItems.push({ description: lineLabels.bonus, amount: Number(payrollRecord.bonus) });
      }
      if (payrollRecord.otherAllowances && Number(payrollRecord.otherAllowances) > 0) {
        lineItems.push({ description: lineLabels.otherAllowances, amount: Number(payrollRecord.otherAllowances) });
      }
    }

    const gross =
      payrollRecord.grossSalary != null
        ? Number(payrollRecord.grossSalary)
        : lineItems.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0);

    const deductions: { description: string; amount: number }[] = [];
    const addDed = (label: string, val?: number | null) => {
      if (val != null && Number(val) > 0) deductions.push({ description: label, amount: Number(val) });
    };
    if (dbRecord?.lineItems?.length) {
      for (const li of dbRecord.lineItems) {
        if (li.type === 'deduction') {
          const tag = li.isRecurring ? '' : lineLabels.oneTime;
          deductions.push({ description: `${li.name}${tag}`, amount: Number(li.amount) });
        }
      }
    }
    addDed(lineLabels.incomeTax, payrollRecord.incomeTax);
    addDed(lineLabels.socialSecurity, payrollRecord.socialSecurity);
    addDed(lineLabels.insurance, payrollRecord.insurance);
    if (!dbRecord?.lineItems?.length) {
      addDed(lineLabels.loanRepayment, payrollRecord.loanRepayment);
      addDed(lineLabels.otherDeductions, payrollRecord.otherDeductions);
    } else if (!deductions.some((d) => /loan|other/i.test(d.description))) {
      addDed(lineLabels.otherDeductions, payrollRecord.otherDeductions);
    }

    const totalDeductions =
      payrollRecord.totalDeductions != null
        ? Number(payrollRecord.totalDeductions)
        : deductions.reduce((s, d) => s + d.amount, 0);

    const netPay = Number(payrollRecord.totalAmount);
    const { logoBase64 } = await resolveInvoiceLogo(payrollRecord.companyId);

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      // Setup dynamic document flow with bufferPages turned on
      const doc = new PDFDocument({ 
        size: 'A4', 
        margins: { top: 135, bottom: 65, left: MARGIN, right: MARGIN }, 
        bufferPages: true 
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pdfLocale = settings.invoiceLanguage;
      const fonts = registerPdfFonts(doc, pdfLocale);

      // --- STAGE 1: BODY CONTENT FLOW ---
      let y = doc.y;

      // Card Header: Employer/Employee Cards Block
      const metaCardH = 80;
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_W, metaCardH, 6)
         .fillColor(LIGHT_BG)
         .fill();
      doc.roundedRect(MARGIN, y, CONTENT_W, metaCardH, 6)
         .lineWidth(0.75)
         .strokeColor(BORDER_SLATE)
         .stroke();
      doc.restore();

      const colW = (CONTENT_W - 30) / 2;

      // Employer Segment
      doc.font(fonts.bold).fontSize(7.5).fillColor(GOLD).text(pt(labels.employer), MARGIN + 12, y + 12);
      doc.font(fonts.bold).fontSize(11).fillColor(TEXT_DARK).text(pt(companyName), MARGIN + 12, y + 24, { width: colW, lineBreak: false });
      if (settings.address) {
        doc.font(fonts.regular).fontSize(8.5).fillColor(TEXT_MID).text(pt(settings.address), MARGIN + 12, y + 38, { width: colW, height: 32, ellipsis: true });
      }

      // Employee Segment
      const rightColX = MARGIN + colW + 30;
      doc.font(fonts.bold).fontSize(7.5).fillColor(GOLD).text(pt(labels.employee), rightColX, y + 12);
      doc.font(fonts.bold).fontSize(11).fillColor(TEXT_DARK).text(pt(employeeName), rightColX, y + 24, { width: colW, lineBreak: false });
      doc.font(fonts.regular).fontSize(8.5).fillColor(TEXT_MID).text(payrollRecord.user.email, rightColX, y + 38, { width: colW, lineBreak: false });

      const rateStr = payrollRecord.payrollType === 'fixed'
        ? labels.fixedSalary
        : `${labels.rate}: ${sym}${Number(payrollRecord.hourlyRate || 0).toFixed(2)}/hr`;
      doc.font(fonts.bold).fontSize(8).fillColor(NAVY).text(pt(rateStr), rightColX, y + 54, { width: colW });

      y += metaCardH + 15;

      // Itemized Earnings Table
      y = drawTableSectionHeader(doc, labels.earnings, y, labels.amount, fonts, pdfLocale);
      lineItems.forEach((item, idx) => {
        y = drawTableRow(doc, item.description, `${sym}${item.amount.toFixed(2)}`, idx % 2 === 0, y, false, fonts, pdfLocale);
      });
      y = drawTableSubtotalRow(doc, labels.grossTotal, `${sym}${gross.toFixed(2)}`, y, fonts, pdfLocale);

      // Itemized Deductions Table
      y += 10;
      y = drawTableSectionHeader(doc, labels.deductions, y, labels.amount, fonts, pdfLocale);
      if (deductions.length === 0) {
        y = drawTableRow(doc, labels.noDeductions, `${sym}0.00`, false, y, false, fonts, pdfLocale);
      } else {
        deductions.forEach((d, idx) => {
          y = drawTableRow(doc, d.description, `-${sym}${d.amount.toFixed(2)}`, idx % 2 === 0, y, true, fonts, pdfLocale);
        });
      }
      y = drawTableSubtotalRow(doc, labels.totalDeductions, `-${sym}${totalDeductions.toFixed(2)}`, y, fonts, pdfLocale);

      // Highlight Net Take-Home Pay Banner Card
      y += 12;
      const netCardH = 34;
      doc.save();
      fillRect(doc, MARGIN, y, CONTENT_W, netCardH, NAVY);
      fillRect(doc, MARGIN, y, 4, netCardH, GOLD); // Gold side accent

      doc.font(fonts.bold).fontSize(10).fillColor(WHITE).text(pt(labels.netPay), MARGIN + 16, y + 12);
      const netPayStr = `${sym}${netPay.toFixed(2)}`;
      doc.font(fonts.bold).fontSize(14).fillColor(GOLD).text(netPayStr, MARGIN + CONTENT_W - 210, y + 10, { width: 200, align: 'right' });
      doc.restore();

      y += netCardH + 15;

      // Metadata & Verification Box
      const metaBoxH = 50;
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_W, metaBoxH, 4)
         .fillColor(LIGHT_BG)
         .fill();
      doc.roundedRect(MARGIN, y, CONTENT_W, metaBoxH, 4)
         .lineWidth(0.5)
         .strokeColor(BORDER_SLATE)
         .stroke();
      doc.restore();

      doc.font(fonts.bold).fontSize(7.5).fillColor(TEXT_MID).text(pt(labels.paymentDetails), MARGIN + 12, y + 10);
      doc.font(fonts.regular).fontSize(8).fillColor(TEXT_DARK).text(pt(`${labels.status}: ${payrollRecord.status.toUpperCase()}`), MARGIN + 12, y + 22);
      if (payrollRecord.paidAt) {
        doc.font(fonts.regular).fontSize(8).fillColor(TEXT_DARK).text(pt(`${labels.paymentDate}: ${new Date(payrollRecord.paidAt).toLocaleDateString(dateLocale)}`), MARGIN + 12, y + 32);
      }

      const methodStr = payrollRecord.paymentMethod
        ? `${labels.method}: ${payrollRecord.paymentMethod}`
        : `${labels.method}: ${labels.bankTransfer}`;
      doc.font(fonts.bold).fontSize(7.5).fillColor(TEXT_MID).text(pt(labels.transactionRef), MARGIN + CONTENT_W / 2 + 12, y + 10);
      doc.font(fonts.regular).fontSize(8).fillColor(TEXT_DARK).text(pt(methodStr), MARGIN + CONTENT_W / 2 + 12, y + 22);

      y += metaBoxH + 20;
      doc.y = y;

      // Chronological Shift Breakdown Logs
      if (shiftBreakdown.length > 0) {
        if (doc.y > PAGE_H - 120) {
          doc.addPage();
        }
        
        let shiftY = doc.y;
        doc.font(fonts.bold).fontSize(10).fillColor(NAVY).text(pt(labels.shiftLog), MARGIN, shiftY);
        shiftY += 15;
        
        // Custom Shift Table Header
        fillRect(doc, MARGIN, shiftY, CONTENT_W, 18, NAVY_MID);
        doc.font(fonts.bold).fontSize(8).fillColor(WHITE).text(pt(labels.date), MARGIN + 10, shiftY + 5);
        doc.text(pt(labels.shiftDetails), MARGIN + 90, shiftY + 5, { width: CONTENT_W - 190 });
        doc.text(pt(labels.hours), MARGIN + CONTENT_W - 70, shiftY + 5, { width: 60, align: 'right' });
        shiftY += 18;
        
        shiftBreakdown.forEach((shift, idx) => {
          // Preemptive height inspector: if current y is close to bottom, add a clean page break
          if (shiftY > PAGE_H - 85) {
            doc.addPage();
            shiftY = doc.y; // Starts automatically on next page bound (135)
            
            // Re-render table headers on secondary pages
            fillRect(doc, MARGIN, shiftY, CONTENT_W, 18, NAVY_MID);
            doc.font(fonts.bold).fontSize(8).fillColor(WHITE).text(pt(labels.date), MARGIN + 10, shiftY + 5);
            doc.text(pt(labels.shiftDetails), MARGIN + 90, shiftY + 5, { width: CONTENT_W - 190 });
            doc.text(pt(labels.hours), MARGIN + CONTENT_W - 70, shiftY + 5, { width: 60, align: 'right' });
            shiftY += 18;
          }
          
          if (idx % 2 === 0) {
            fillRect(doc, MARGIN, shiftY, CONTENT_W, 16, LIGHT_BG);
          }
          
          doc.font(fonts.regular).fontSize(8).fillColor(TEXT_DARK);
          doc.text(new Date(shift.date).toLocaleDateString(dateLocale), MARGIN + 10, shiftY + 4);
          doc.text(pt(shift.label), MARGIN + 90, shiftY + 4, { width: CONTENT_W - 190, lineBreak: false });
          
          doc.font(fonts.bold).text(shift.hours.toFixed(2), MARGIN + CONTENT_W - 70, shiftY + 4, { width: 60, align: 'right' });
          
          doc.save()
             .moveTo(MARGIN, shiftY + 16)
             .lineTo(MARGIN + CONTENT_W, shiftY + 16)
             .lineWidth(0.3)
             .strokeColor(BORDER_SLATE)
             .stroke()
             .restore();
             
          shiftY += 16;
        });
        
        doc.y = shiftY;
      }

      // --- STAGE 2: TWO-PASS HEADER/FOOTER STAMPING ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        
        // 1. Structural Header Banner
        fillRect(doc, 0, 0, PAGE_W, 105, NAVY);
        fillRect(doc, 0, 105, PAGE_W, 3, GOLD); // Highlight Gold Line

        if (logoBase64) {
          try {
            const raw = logoBase64.includes(',') ? logoBase64.split(',')[1] : logoBase64;
            doc.image(Buffer.from(raw, 'base64'), MARGIN, 20, { fit: [140, 65], valign: 'center' });
          } catch {
            doc.font(fonts.bold).fontSize(14).fillColor(WHITE).text(pt(companyName), MARGIN, 45, { width: 220 });
          }
        } else {
          doc.font(fonts.bold).fontSize(14).fillColor(WHITE).text(pt(companyName), MARGIN, 45, { width: 220 });
        }

        doc.font(fonts.bold).fontSize(22).fillColor(WHITE).text(pt(labels.payslip), MARGIN, 24, { width: CONTENT_W, align: 'right' });
        doc.font(fonts.bold).fontSize(10).fillColor(GOLD).text(invoiceNumber, MARGIN, 52, { width: CONTENT_W, align: 'right' });
        
        const periodStr = `${labels.period}: ${new Date(payrollRecord.periodStart).toLocaleDateString(dateLocale)} – ${new Date(payrollRecord.periodEnd).toLocaleDateString(dateLocale)}`;
        doc.font(fonts.regular).fontSize(8.5).fillColor(WHITE).text(pt(periodStr), MARGIN, 68, { width: CONTENT_W, align: 'right' });

        // 2. Structural Footer Banner
        fillRect(doc, 0, PAGE_H - 45, PAGE_W, 45, NAVY);
        fillRect(doc, 0, PAGE_H - 45, PAGE_W, 2, GOLD); // Highlight Gold Line

        const footerText = `${companyName}   •   ${labels.payslip}: ${invoiceNumber}   •   ${labels.page} ${i + 1} ${labels.of} ${pages.count}`;
        doc.font(fonts.regular).fontSize(8).fillColor(TEXT_LIGHT).text(pt(footerText), MARGIN, PAGE_H - 28, { width: CONTENT_W, align: 'center' });
      }

      doc.end();
    });

    // --- STAGE 3: CHECKSUM VERIFICATION & CLOUDINARY SYNC ---
    const checksum = await payrollPdfChecksum(pdfBuffer);
    const upload = await uploadPDFToCloudinary(pdfBuffer, payrollRecord.id, checksum);
    if (!upload.success || !upload.secureUrl) {
      throw new Error(upload.error || 'Failed to upload payslip PDF');
    }

    return { 
      success: true, 
      pdfUrl: upload.secureUrl, 
      pdfBuffer, 
      checksum, 
      generatedAt: new Date() 
    };
  } catch (error) {
    console.error('Payroll invoice PDF generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      generatedAt: new Date(),
    };
  }
}