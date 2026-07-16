import { NextRequest, NextResponse } from 'next/server';
import { requireSalesAgentAdmin, jsonOk } from '@/lib/sales-agent/auth';
import { getSalesAgentDashboard } from '@/lib/sales-agent/dashboard';
import { saLog } from '@/lib/sales-agent/logger';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const data = await getSalesAgentDashboard();
  await saLog({
    category: 'api',
    action: 'dashboard_view',
    message: 'Dashboard loaded',
    userId: gate.userId,
  });
  return jsonOk(data);
}
