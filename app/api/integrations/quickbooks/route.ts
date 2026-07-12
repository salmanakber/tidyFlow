import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { requireAuth, resolveCompanyId, isManagerPlusRole } from '@/lib/rbac';
import {
  disconnectQuickBooks,
  getQuickBooksStatus,
  syncClientInvoiceToQuickBooks,
  updateQuickBooksSettings,
} from '@/lib/quickbooks';
import prisma from '@/lib/prisma';

function integrationForbidden(role: string) {
  return !isManagerPlusRole(role as UserRole);
}

async function resolveIntegrationCompanyId(request: NextRequest, tokenUser: { userId: number; role: string; companyId?: number | null }) {
  let companyId = resolveCompanyId(request, tokenUser as Parameters<typeof resolveCompanyId>[1]);
  if (!companyId && tokenUser.companyId) companyId = tokenUser.companyId;
  if (!companyId) {
    const user = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { companyId: true },
    });
    companyId = user?.companyId ?? null;
  }
  return companyId;
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (integrationForbidden(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveIntegrationCompanyId(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const status = await getQuickBooksStatus(companyId);
  return NextResponse.json({ success: true, data: status });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (integrationForbidden(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveIntegrationCompanyId(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const body = await request.json();
  const { autoSyncOnSend, autoSyncOnPaid } = body as {
    autoSyncOnSend?: boolean;
    autoSyncOnPaid?: boolean;
  };

  const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!conn) {
    return NextResponse.json({ success: false, message: 'QuickBooks not connected' }, { status: 400 });
  }

  await updateQuickBooksSettings(companyId, {
    ...(typeof autoSyncOnSend === 'boolean' ? { autoSyncOnSend } : {}),
    ...(typeof autoSyncOnPaid === 'boolean' ? { autoSyncOnPaid } : {}),
  });

  const status = await getQuickBooksStatus(companyId);
  return NextResponse.json({ success: true, data: status });
}

export async function DELETE(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (integrationForbidden(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveIntegrationCompanyId(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  await disconnectQuickBooks(companyId);
  return NextResponse.json({ success: true, data: { connected: false } });
}

/** POST /api/integrations/quickbooks — manual sync (single invoice or batch pending) */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (integrationForbidden(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveIntegrationCompanyId(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!conn) {
    return NextResponse.json({ success: false, message: 'QuickBooks not connected' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { invoiceId, syncPending } = body as { invoiceId?: number; syncPending?: boolean };

  try {
    if (invoiceId) {
      const result = await syncClientInvoiceToQuickBooks(companyId, Number(invoiceId));
      return NextResponse.json({ success: true, data: result });
    }

    if (syncPending) {
      const pending = await prisma.clientInvoice.findMany({
        where: {
          companyId,
          status: { in: ['sent', 'paid', 'draft'] },
          OR: [
            { quickbooksSyncStatus: null },
            { quickbooksSyncStatus: 'failed' },
            { quickbooksSyncStatus: 'pending' },
          ],
          NOT: { quickbooksSyncStatus: 'synced' },
        },
        orderBy: { createdAt: 'asc' },
        take: 25,
      });

      const results: Array<{ invoiceId: number; ok: boolean; error?: string }> = [];
      for (const inv of pending) {
        try {
          await syncClientInvoiceToQuickBooks(companyId, inv.id);
          results.push({ invoiceId: inv.id, ok: true });
        } catch (e) {
          results.push({
            invoiceId: inv.id,
            ok: false,
            error: e instanceof Error ? e.message : 'Failed',
          });
        }
      }

      const status = await getQuickBooksStatus(companyId);
      return NextResponse.json({ success: true, data: { results, status } });
    }

    return NextResponse.json({ success: false, message: 'invoiceId or syncPending required' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
