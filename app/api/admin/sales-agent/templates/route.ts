import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { sendSalesEmail, renderTemplate } from '@/lib/sales-agent/email';
import { getSalesAgentSmtpConfig } from '@/lib/sales-agent/config';
import { saLog } from '@/lib/sales-agent/logger';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const status = request.nextUrl.searchParams.get('status');
  // List view: skip huge html/text bodies so Outreach → Templates opens quickly
  const items = await (prisma as any).saEmailTemplate.findMany({
    where: status ? { status } : {},
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      subject: true,
      status: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { versions: true, campaigns: true } },
    },
  });
  return jsonOk(items);
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();

  if (body.action === 'duplicate' && body.id) {
    const src = await (prisma as any).saEmailTemplate.findUnique({ where: { id: Number(body.id) } });
    if (!src) return jsonError('Template not found', 404);
    const copy = await (prisma as any).saEmailTemplate.create({
      data: {
        name: `${src.name} (Copy)`,
        subject: src.subject,
        htmlBody: src.htmlBody,
        textBody: src.textBody,
        status: 'DRAFT',
        version: 1,
        createdById: gate.userId,
      },
    });
    await (prisma as any).saEmailTemplateVersion.create({
      data: {
        templateId: copy.id,
        version: 1,
        subject: copy.subject,
        htmlBody: copy.htmlBody,
        textBody: copy.textBody,
        createdById: gate.userId,
      },
    });
    return jsonOk(copy, 201);
  }

  if (!body.name || !body.subject) return jsonError('name and subject are required');

  const template = await (prisma as any).saEmailTemplate.create({
    data: {
      name: body.name,
      subject: body.subject,
      htmlBody: body.htmlBody || null,
      textBody: body.textBody || null,
      status: body.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      version: 1,
      createdById: gate.userId,
    },
  });

  await (prisma as any).saEmailTemplateVersion.create({
    data: {
      templateId: template.id,
      version: 1,
      subject: template.subject,
      htmlBody: template.htmlBody,
      textBody: template.textBody,
      createdById: gate.userId,
    },
  });

  await saLog({
    category: 'user',
    action: 'template_created',
    message: `Created template ${template.name}`,
    entityType: 'SaEmailTemplate',
    entityId: template.id,
    userId: gate.userId,
  });

  return jsonOk(template, 201);
}
