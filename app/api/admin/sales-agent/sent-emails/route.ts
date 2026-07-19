import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { enqueueRetryEmail, enqueueSendEmail } from '@/lib/sales-agent/queue';
import { buildTemplateVars, renderTemplate, sendSalesEmail } from '@/lib/sales-agent/email';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = Math.min(100, parseInt(sp.get('pageSize') || '25', 10));
  const status = sp.get('status');
  const search = sp.get('search');
  const campaignId = sp.get('campaignId');

  const where: Record<string, any> = {};
  if (status) where.deliveryStatus = status;
  if (campaignId) where.campaignId = Number(campaignId);
  const discoveryGroupId = sp.get('discoveryGroupId') || sp.get('groupId');
  if (discoveryGroupId) {
    where.company = {
      groupMembers: { some: { groupId: Number(discoveryGroupId) } },
    };
  }
  if (search) {
    where.OR = [
      { recipientEmail: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { recipientName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    (prisma as any).saSentEmail.count({ where }),
    (prisma as any).saSentEmail.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        company: { select: { id: true, name: true, city: true } },
        campaign: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        _count: { select: { replies: true } },
      },
    }),
  ]);

  return jsonOk({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();

  if (body.action === 'retry' && body.id) {
    await enqueueRetryEmail(Number(body.id));
    return jsonOk({ queued: true });
  }

  if (body.action === 'bulk_delete' && Array.isArray(body.ids)) {
    const ids = body.ids.map(Number).filter(Boolean);
    if (!ids.length) return jsonError('ids required');
    // Detach replies first so sent-email rows can be removed cleanly
    await (prisma as any).saReply.updateMany({
      where: { sentEmailId: { in: ids } },
      data: { sentEmailId: null },
    });
    const result = await (prisma as any).saSentEmail.deleteMany({ where: { id: { in: ids } } });
    return jsonOk({ deleted: result.count });
  }

  if (body.action === 'delete' && body.id) {
    const id = Number(body.id);
    await (prisma as any).saReply.updateMany({
      where: { sentEmailId: id },
      data: { sentEmailId: null },
    });
    await (prisma as any).saSentEmail.delete({ where: { id } });
    return jsonOk({ deleted: true, id });
  }

  if (body.action === 'send' || body.companyId) {
    if (!body.companyId && !body.to) return jsonError('companyId or to is required');
    let to = body.to;
    let subject = body.subject;
    let htmlBody = body.htmlBody;
    let textBody = body.textBody;
    let templateId = body.templateId ? Number(body.templateId) : undefined;

    if (body.companyId && body.templateId) {
      const template = await (prisma as any).saEmailTemplate.findUnique({
        where: { id: Number(body.templateId) },
      });
      if (!template) return jsonError('Template not found', 404);
      const company = await (prisma as any).saLeadCompany.findUnique({
        where: { id: Number(body.companyId) },
      });
      if (!company?.email && !body.to) return jsonError('Lead has no email');
      to = body.to || company.email;
      const vars = await buildTemplateVars(Number(body.companyId));
      subject = renderTemplate(template.subject, vars);
      htmlBody = template.htmlBody ? renderTemplate(template.htmlBody, vars) : undefined;
      textBody = template.textBody ? renderTemplate(template.textBody, vars) : undefined;
      templateId = template.id;
    }

    if (!to || !subject) return jsonError('to and subject are required');

    const record = await sendSalesEmail({
      companyId: body.companyId ? Number(body.companyId) : undefined,
      campaignId: body.campaignId ? Number(body.campaignId) : undefined,
      templateId,
      to,
      toName: body.toName,
      subject,
      htmlBody,
      textBody,
      aiPrompt: body.aiPrompt,
      aiProvider: body.aiProvider,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
    });

    if (body.async !== false && record.deliveryStatus === 'QUEUED') {
      const delay = record.scheduledFor
        ? Math.max(0, new Date(record.scheduledFor).getTime() - Date.now())
        : 0;
      await enqueueSendEmail(record.id, delay);
    }

    return jsonOk(record, 201);
  }

  return jsonError('Unknown action');
}

export async function DELETE(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!id) return jsonError('id is required');

  const existing = await (prisma as any).saSentEmail.findUnique({ where: { id } });
  if (!existing) return jsonError('Sent email not found', 404);

  await (prisma as any).saReply.updateMany({
    where: { sentEmailId: id },
    data: { sentEmailId: null },
  });
  await (prisma as any).saSentEmail.delete({ where: { id } });
  return jsonOk({ deleted: true, id });
}
