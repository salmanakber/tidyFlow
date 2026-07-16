import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { classifyAndStoreReply } from '@/lib/sales-agent/replies';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = Math.min(100, parseInt(sp.get('pageSize') || '25', 10));
  const intent = sp.get('intent');
  const companyId = sp.get('companyId');
  const search = sp.get('search');

  const where: Record<string, any> = {};
  if (intent) where.intent = intent;
  if (companyId) where.companyId = Number(companyId);
  if (search) {
    where.OR = [
      { fromEmail: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { bodyText: { contains: search, mode: 'insensitive' } },
      { aiSummary: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    (prisma as any).saReply.count({ where }),
    (prisma as any).saReply.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        company: { select: { id: true, name: true, city: true } },
        sentEmail: { select: { id: true, subject: true, sentAt: true, messageId: true } },
      },
    }),
  ]);

  return jsonOk({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  if (!body.fromEmail) return jsonError('fromEmail is required');

  const reply = await classifyAndStoreReply({
    fromEmail: body.fromEmail,
    fromName: body.fromName,
    subject: body.subject,
    bodyText: body.bodyText,
    bodyHtml: body.bodyHtml,
    messageId: body.messageId,
    inReplyTo: body.inReplyTo,
    threadId: body.threadId,
    sentEmailId: body.sentEmailId ? Number(body.sentEmailId) : undefined,
    companyId: body.companyId ? Number(body.companyId) : undefined,
  });

  return jsonOk(reply, 201);
}

export async function PATCH(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  if (!body.id) return jsonError('id is required');
  const data: Record<string, unknown> = {};
  if (body.intent) data.intent = body.intent;
  if (body.sentiment) data.sentiment = body.sentiment;
  if (body.isPositive !== undefined) data.isPositive = body.isPositive;

  const reply = await (prisma as any).saReply.update({
    where: { id: Number(body.id) },
    data,
  });
  return jsonOk(reply);
}
