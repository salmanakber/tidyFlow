import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { sendSalesEmail, renderTemplate } from '@/lib/sales-agent/email';
import { getSalesAgentSmtpConfig } from '@/lib/sales-agent/config';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(_request);
  if (gate instanceof NextResponse) return gate;

  const template = await (prisma as any).saEmailTemplate.findUnique({
    where: { id: parseInt(params.id, 10) },
    include: {
      versions: { orderBy: { version: 'desc' } },
      children: { orderBy: [{ delayDays: 'asc' }, { id: 'asc' }] },
      parent: { select: { id: true, name: true } },
    },
  });
  if (!template) return jsonError('Not found', 404);
  return jsonOk(template);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const body = await request.json();
  const existing = await (prisma as any).saEmailTemplate.findUnique({ where: { id } });
  if (!existing) return jsonError('Not found', 404);

  const nextVersion = existing.version + 1;
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.subject !== undefined) data.subject = body.subject;
  if (body.htmlBody !== undefined) data.htmlBody = body.htmlBody;
  if (body.textBody !== undefined) data.textBody = body.textBody;
  if (body.status !== undefined) data.status = body.status;
  if (body.language !== undefined) data.language = body.language || null;
  if (body.country !== undefined) data.country = body.country || null;
  if (body.delayDays !== undefined) data.delayDays = Math.max(0, Number(body.delayDays) || 0);
  if (body.stepLabel !== undefined) data.stepLabel = body.stepLabel || null;
  if (body.parentId !== undefined) {
    data.parentId = body.parentId ? Number(body.parentId) : null;
  }

  const contentChanged =
    (body.subject !== undefined && body.subject !== existing.subject) ||
    (body.htmlBody !== undefined && body.htmlBody !== existing.htmlBody) ||
    (body.textBody !== undefined && body.textBody !== existing.textBody);

  if (contentChanged) {
    data.version = nextVersion;
    await (prisma as any).saEmailTemplateVersion.create({
      data: {
        templateId: id,
        version: nextVersion,
        subject: (body.subject ?? existing.subject) as string,
        htmlBody: (body.htmlBody ?? existing.htmlBody) as string | null,
        textBody: (body.textBody ?? existing.textBody) as string | null,
        createdById: gate.userId,
      },
    });
  }

  const updated = await (prisma as any).saEmailTemplate.update({ where: { id }, data });
  return jsonOk(updated);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const body = await request.json();
  const template = await (prisma as any).saEmailTemplate.findUnique({ where: { id } });
  if (!template) return jsonError('Not found', 404);

  // Preview
  if (body.action === 'preview') {
    const vars = {
      company_name: body.company_name || 'Acme Cleaning Ltd',
      contact_name: body.contact_name || 'Alex',
      website: body.website || 'https://example.com',
      city: body.city || 'Your City',
      services: body.services || 'office cleaning, commercial cleaning',
      personalized_intro:
        body.personalized_intro ||
        'I noticed your team delivers commercial cleans in your area.',
      sender_name: (await getSalesAgentSmtpConfig()).senderName,
      booking_link: body.booking_link || 'https://tidyflowapp.com',
    };
    return jsonOk({
      subject: renderTemplate(template.subject, vars),
      htmlBody: template.htmlBody ? renderTemplate(template.htmlBody, vars) : null,
      textBody: template.textBody ? renderTemplate(template.textBody, vars) : null,
      vars,
    });
  }

  // Test email
  if (body.action === 'test_email') {
    if (!body.to) return jsonError('to email is required');
    const smtp = await getSalesAgentSmtpConfig();
    const vars = {
      company_name: 'Test Company',
      contact_name: 'Test Contact',
      website: 'https://example.com',
      city: 'Your City',
      services: 'commercial cleaning',
      personalized_intro: 'This is a test of your TidyFlow outreach template.',
      sender_name: smtp.senderName,
      booking_link: 'https://tidyflowapp.com',
    };
    const record = await sendSalesEmail({
      templateId: id,
      to: body.to,
      subject: `[TEST] ${renderTemplate(template.subject, vars)}`,
      htmlBody: template.htmlBody ? renderTemplate(template.htmlBody, vars) : undefined,
      textBody: template.textBody ? renderTemplate(template.textBody, vars) : undefined,
    });
    return jsonOk(record);
  }

  return jsonError('Unknown action');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(params.id, 10);
  const existing = await (prisma as any).saEmailTemplate.findUnique({ where: { id } });
  if (!existing) return jsonError('Not found', 404);

  await (prisma as any).saCampaign.updateMany({
    where: { templateId: id },
    data: { templateId: null },
  });
  await (prisma as any).saSentEmail.updateMany({
    where: { templateId: id },
    data: { templateId: null },
  });
  await (prisma as any).saEmailTemplate.delete({ where: { id } });
  return jsonOk({ deleted: true, id });
}
