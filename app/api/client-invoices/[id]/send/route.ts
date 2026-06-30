import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { sendEmail } from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  const body = await request.json();
  const { channel } = body as { channel?: 'email' | 'whatsapp' };

  const invoice = await prisma.clientInvoice.findFirst({
    where: { id: Number(params.id), ...(companyId ? { companyId } : {}) },
    include: { company: { select: { name: true } } },
  });

  if (!invoice || !invoice.pdfUrl) {
    return NextResponse.json({ success: false, message: 'Invoice or PDF not found' }, { status: 404 });
  }

  if (channel === 'email') {
    if (!invoice.clientEmail) {
      return NextResponse.json({ success: false, message: 'Client email required' }, { status: 400 });
    }

    await sendEmail({
      to: invoice.clientEmail,
      subject: `Invoice ${invoice.invoiceNumber} from ${invoice.company.name}`,
      html: `<p>Dear ${invoice.clientName},</p>
<p>Please find your invoice for cleaning services.</p>
<p><strong>Amount due:</strong> £${Number(invoice.totalAmount).toFixed(2)}</p>
<p><a href="${invoice.pdfUrl}">View / Download Invoice</a></p>
<p>Thank you,<br/>${invoice.company.name}</p>`,
    });

    await prisma.clientInvoice.update({
      where: { id: invoice.id },
      data: { status: invoice.status === 'draft' ? 'sent' : invoice.status, sentAt: new Date() },
    });

    return NextResponse.json({ success: true, data: { channel: 'email', sent: true } });
  }

  const message = encodeURIComponent(
    `Invoice ${invoice.invoiceNumber} from ${invoice.company.name} — £${Number(invoice.totalAmount).toFixed(2)}. View: ${invoice.pdfUrl}`
  );
  const phone = invoice.clientPhone?.replace(/\D/g, '') || '';
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${message}`
    : `https://wa.me/?text=${message}`;

  await prisma.clientInvoice.update({
    where: { id: invoice.id },
    data: { status: invoice.status === 'draft' ? 'sent' : invoice.status, sentAt: new Date() },
  });

  return NextResponse.json({ success: true, data: { channel: 'whatsapp', url: whatsappUrl } });
}
