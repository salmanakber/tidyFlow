import { NextRequest, NextResponse } from 'next/server';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import { enqueueAnalyzeLead, enqueueBulkAnalyze } from '@/lib/sales-agent/queue';
import { analyzeLeadCompany } from '@/lib/sales-agent/analyzer';

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();

  if (Array.isArray(body.ids)) {
    await enqueueBulkAnalyze(body.ids.map(Number));
    return jsonOk({ queued: body.ids.length });
  }

  if (!body.companyId) return jsonError('companyId or ids required');

  if (body.async === false) {
    const analysis = await analyzeLeadCompany(Number(body.companyId));
    return jsonOk(analysis);
  }

  await enqueueAnalyzeLead(Number(body.companyId));
  return jsonOk({ queued: true, companyId: Number(body.companyId) });
}
