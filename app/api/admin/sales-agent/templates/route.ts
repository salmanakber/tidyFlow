import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { saLog } from '@/lib/sales-agent/logger';
import { expandTemplatePackToSteps } from '@/lib/sales-agent/campaign-sequence';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const status = request.nextUrl.searchParams.get('status');
  const language = request.nextUrl.searchParams.get('language');
  const country = request.nextUrl.searchParams.get('country');
  const packsOnly = request.nextUrl.searchParams.get('packsOnly') === 'true';
  const includeChildren = request.nextUrl.searchParams.get('includeChildren') !== 'false';

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (language) where.language = language;
  if (country) where.country = country;
  // Top-level templates only (packs + standalone); children nest under parent
  if (packsOnly || includeChildren) {
    where.parentId = null;
  }

  const items = await (prisma as any).saEmailTemplate.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      subject: true,
      language: true,
      country: true,
      status: true,
      version: true,
      parentId: true,
      delayDays: true,
      stepLabel: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { versions: true, campaigns: true, children: true } },
      ...(includeChildren
        ? {
            children: {
              orderBy: [{ delayDays: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                name: true,
                subject: true,
                status: true,
                delayDays: true,
                stepLabel: true,
                language: true,
                country: true,
                updatedAt: true,
              },
            },
          }
        : {}),
    },
  });
  return jsonOk(items);
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();

  if (body.action === 'expand_pack' && body.id) {
    const steps = await expandTemplatePackToSteps(prisma as any, Number(body.id));
    return jsonOk({ steps });
  }

  if (body.action === 'duplicate' && body.id) {
    const src = await (prisma as any).saEmailTemplate.findUnique({
      where: { id: Number(body.id) },
      include: { children: { orderBy: [{ delayDays: 'asc' }, { id: 'asc' }] } },
    });
    if (!src) return jsonError('Template not found', 404);

    const copy = await (prisma as any).saEmailTemplate.create({
      data: {
        name: `${src.name} (Copy)`,
        subject: src.subject,
        htmlBody: src.htmlBody,
        textBody: src.textBody,
        language: src.language || null,
        country: src.country || null,
        delayDays: src.delayDays || 0,
        stepLabel: src.stepLabel || null,
        parentId: null,
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

    // Duplicate child follow-ups under the new pack root
    if (!src.parentId && Array.isArray(src.children)) {
      for (const child of src.children) {
        const childCopy = await (prisma as any).saEmailTemplate.create({
          data: {
            name: child.name,
            subject: child.subject,
            htmlBody: child.htmlBody,
            textBody: child.textBody,
            language: child.language || src.language || null,
            country: child.country || src.country || null,
            delayDays: child.delayDays || 0,
            stepLabel: child.stepLabel || null,
            parentId: copy.id,
            status: 'DRAFT',
            version: 1,
            createdById: gate.userId,
          },
        });
        await (prisma as any).saEmailTemplateVersion.create({
          data: {
            templateId: childCopy.id,
            version: 1,
            subject: childCopy.subject,
            htmlBody: childCopy.htmlBody,
            textBody: childCopy.textBody,
            createdById: gate.userId,
          },
        });
      }
    }

    return jsonOk(copy, 201);
  }

  if (!body.name || !body.subject) return jsonError('name and subject are required');

  const parentId = body.parentId ? Number(body.parentId) : null;
  if (parentId) {
    const parent = await (prisma as any).saEmailTemplate.findUnique({ where: { id: parentId } });
    if (!parent) return jsonError('Parent template not found', 404);
    if (parent.parentId) return jsonError('Cannot nest under a child template — use the pack root');
  }

  const template = await (prisma as any).saEmailTemplate.create({
    data: {
      name: body.name,
      subject: body.subject,
      htmlBody: body.htmlBody || null,
      textBody: body.textBody || null,
      language: body.language || null,
      country: body.country || null,
      parentId,
      delayDays: body.delayDays != null ? Math.max(0, Number(body.delayDays)) : parentId ? 1 : 0,
      stepLabel: body.stepLabel || null,
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
    action: parentId ? 'template_child_created' : 'template_created',
    message: parentId
      ? `Created follow-up template ${template.name} under pack #${parentId}`
      : `Created template ${template.name}`,
    entityType: 'SaEmailTemplate',
    entityId: template.id,
    userId: gate.userId,
  });

  return jsonOk(template, 201);
}
