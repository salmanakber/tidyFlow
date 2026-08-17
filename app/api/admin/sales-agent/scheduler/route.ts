import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { enqueueSchedulerJob } from '@/lib/sales-agent/queue';
import { saLog } from '@/lib/sales-agent/logger';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const jobs = await (prisma as any).saSchedulerJob.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      runs: { orderBy: { startedAt: 'desc' }, take: 5 },
    },
  });
  return jsonOk(jobs);
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();

  if (body.action === 'run_now' && body.id) {
    await enqueueSchedulerJob(Number(body.id));
    await saLog({
      category: 'scheduler',
      action: 'manual_run',
      message: `Manual run of scheduler job ${body.id}`,
      userId: gate.userId,
    });
    return jsonOk({ queued: true });
  }

  if (body.action === 'delete' && body.id) {
    const id = Number(body.id);
    await (prisma as any).saSchedulerJob.delete({ where: { id } });
    return jsonOk({ deleted: true, id });
  }

  if (!body.name || !body.jobType) return jsonError('name and jobType are required');

  const job = await (prisma as any).saSchedulerJob.create({
    data: {
      name: body.name,
      jobType: body.jobType,
      cronExpression: body.cronExpression || null,
      runAt: body.runAt ? new Date(body.runAt) : null,
      timezone: body.timezone || 'UTC',
      config: body.config
        ? typeof body.config === 'string'
          ? body.config
          : JSON.stringify(body.config)
        : null,
      enabled: body.enabled !== false,
      createdById: gate.userId,
    },
  });

  if (job.runAt && new Date(job.runAt) > new Date()) {
    const delay = new Date(job.runAt).getTime() - Date.now();
    await enqueueSchedulerJob(job.id, delay);
  }

  return jsonOk(job, 201);
}

export async function PATCH(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  if (!body.id) return jsonError('id is required');

  const data: Record<string, unknown> = {};
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.name !== undefined) data.name = body.name;
  if (body.cronExpression !== undefined) data.cronExpression = body.cronExpression;
  if (body.config !== undefined) {
    data.config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config);
  }

  const job = await (prisma as any).saSchedulerJob.update({
    where: { id: Number(body.id) },
    data,
  });
  return jsonOk(job);
}

export async function DELETE(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!id) return jsonError('id is required');

  const existing = await (prisma as any).saSchedulerJob.findUnique({ where: { id } });
  if (!existing) return jsonError('Job not found', 404);

  await (prisma as any).saSchedulerJob.delete({ where: { id } });
  return jsonOk({ deleted: true, id });
}
