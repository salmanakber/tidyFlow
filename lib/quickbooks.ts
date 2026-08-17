import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/integration-crypto';
import type { ClientInvoice } from '@prisma/client';

const QB_SCOPE = 'com.intuit.quickbooks.accounting';
const OAUTH_AUTH = 'https://appcenter.intuit.com/connect/oauth2';
const OAUTH_TOKEN = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

type OAuthState = {
  companyId: number;
  userId: number;
  mobileRedirect: string;
};

type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

function qbConfig() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  const env = process.env.QUICKBOOKS_ENV === 'production' ? 'production' : 'sandbox';

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('QuickBooks is not configured. Set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_REDIRECT_URI.');
  }

  const apiBase =
    env === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

  return { clientId, clientSecret, redirectUri, env, apiBase };
}

export function isQuickBooksConfigured(): boolean {
  return Boolean(
    process.env.QUICKBOOKS_CLIENT_ID &&
      process.env.QUICKBOOKS_CLIENT_SECRET &&
      process.env.QUICKBOOKS_REDIRECT_URI
  );
}

export function createQuickBooksOAuthState(payload: OAuthState): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET required');
  return jwt.sign(payload, secret, { expiresIn: '15m' });
}

export function parseQuickBooksOAuthState(state: string): OAuthState {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET required');
  return jwt.verify(state, secret) as OAuthState;
}

export function buildQuickBooksAuthUrl(mobileRedirect: string, companyId: number, userId: number): string {
  const { clientId, redirectUri } = qbConfig();
  const state = createQuickBooksOAuthState({ companyId, userId, mobileRedirect });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: QB_SCOPE,
    state,
  });
  return `${OAUTH_AUTH}?${params.toString()}`;
}

async function exchangeToken(body: Record<string, string>) {
  const { clientId, clientSecret } = qbConfig();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error_description || json.error || 'QuickBooks token exchange failed'));
  }
  return json;
}

export async function connectQuickBooksFromCode(params: {
  code: string;
  realmId: string;
  companyId: number;
  userId: number;
}) {
  const { redirectUri } = qbConfig();
  const token = await exchangeToken({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: redirectUri,
  });

  const accessToken = String(token.access_token);
  const refreshToken = String(token.refresh_token);
  const expiresIn = Number(token.expires_in || 3600);
  const refreshExpiresIn = Number(token.x_refresh_token_expires_in || 8726400);

  const accessTokenExp = new Date(Date.now() + expiresIn * 1000);
  const refreshTokenExp = new Date(Date.now() + refreshExpiresIn * 1000);

  let qbCompanyName: string | null = null;
  try {
    const info = await qbApiRequest<{ CompanyInfo?: { CompanyName?: string } }>(
      params.realmId,
      accessToken,
      'GET',
      `/v3/company/${params.realmId}/companyinfo/${params.realmId}`
    );
    qbCompanyName = info?.CompanyInfo?.CompanyName ?? null;
  } catch {
    /* optional */
  }

  await prisma.quickBooksConnection.upsert({
    where: { companyId: params.companyId },
    create: {
      companyId: params.companyId,
      realmId: params.realmId,
      accessTokenEnc: encryptSecret(accessToken),
      refreshTokenEnc: encryptSecret(refreshToken),
      accessTokenExp,
      refreshTokenExp,
      qbCompanyName,
      connectedById: params.userId,
    },
    update: {
      realmId: params.realmId,
      accessTokenEnc: encryptSecret(accessToken),
      refreshTokenEnc: encryptSecret(refreshToken),
      accessTokenExp,
      refreshTokenExp,
      qbCompanyName,
      connectedById: params.userId,
      connectedAt: new Date(),
    },
  });

  await logQuickBooksActivity(params.companyId, null, 'connect', 'success', 'QuickBooks connected');
}

async function refreshQuickBooksTokens(connection: {
  id: number;
  companyId: number;
  refreshTokenEnc: string;
}) {
  const refreshToken = decryptSecret(connection.refreshTokenEnc);
  const token = await exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const accessToken = String(token.access_token);
  const newRefresh = token.refresh_token ? String(token.refresh_token) : refreshToken;
  const expiresIn = Number(token.expires_in || 3600);
  const refreshExpiresIn = Number(token.x_refresh_token_expires_in || 8726400);

  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptSecret(accessToken),
      refreshTokenEnc: encryptSecret(newRefresh),
      accessTokenExp: new Date(Date.now() + expiresIn * 1000),
      refreshTokenExp: new Date(Date.now() + refreshExpiresIn * 1000),
    },
  });

  return accessToken;
}

export async function getQuickBooksAccessToken(companyId: number): Promise<{
  accessToken: string;
  realmId: string;
}> {
  const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!conn) throw new Error('QuickBooks is not connected');

  const bufferMs = 5 * 60 * 1000;
  if (conn.accessTokenExp.getTime() - Date.now() > bufferMs) {
    return { accessToken: decryptSecret(conn.accessTokenEnc), realmId: conn.realmId };
  }

  const accessToken = await refreshQuickBooksTokens(conn);
  const updated = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  return { accessToken, realmId: updated!.realmId };
}

async function qbApiRequest<T>(
  realmId: string,
  accessToken: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const { apiBase } = qbConfig();
  const url = `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: T & { Fault?: { Error?: { Message?: string; Detail?: string }[] } };
  try {
    json = JSON.parse(text) as T & { Fault?: { Error?: { Message?: string; Detail?: string }[] } };
  } catch {
    throw new Error(`QuickBooks API error (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = json?.Fault?.Error?.[0];
    throw new Error(err?.Detail || err?.Message || `QuickBooks API error (${res.status})`);
  }

  return json as T;
}

async function qbQuery<T>(realmId: string, accessToken: string, query: string): Promise<T[]> {
  const { apiBase } = qbConfig();
  const url = `${apiBase}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const json = (await res.json()) as {
    QueryResponse?: Record<string, T[] | number | undefined>;
    Fault?: { Error?: { Message?: string; Detail?: string }[] };
  };
  if (!res.ok) {
    const err = json?.Fault?.Error?.[0];
    throw new Error(err?.Detail || err?.Message || 'QuickBooks query failed');
  }
  const qr = json.QueryResponse || {};
  for (const key of Object.keys(qr)) {
    if (key !== 'startPosition' && key !== 'maxResults' && Array.isArray(qr[key])) {
      return qr[key] as T[];
    }
  }
  return [];
}

async function ensureServiceItem(realmId: string, accessToken: string): Promise<string> {
  const items = await qbQuery<{ Id: string; Name: string }>(
    realmId,
    accessToken,
    "select Id, Name from Item where Type='Service' MAXRESULTS 1"
  );
  if (items[0]?.Id) return items[0].Id;

  const accounts = await qbQuery<{ Id: string }>(
    realmId,
    accessToken,
    "select Id from Account where AccountType='Income' MAXRESULTS 1"
  );
  const incomeAccountId = accounts[0]?.Id || '1';

  const created = await qbApiRequest<{ Item: { Id: string } }>(
    realmId,
    accessToken,
    'POST',
    `/v3/company/${realmId}/item`,
    {
      Name: 'Cleaning Services',
      Type: 'Service',
      IncomeAccountRef: { value: incomeAccountId },
    }
  );
  return created.Item.Id;
}

async function ensurePayrollExpenseAccount(realmId: string, accessToken: string): Promise<string> {
  const accounts = await qbQuery<{ Id: string; Name: string }>(
    realmId,
    accessToken,
    "select Id, Name from Account where AccountType='Expense' MAXRESULTS 100"
  );

  const preferred = accounts.find((account) =>
    /payroll|salary|salaries|wage|labor|labour|staff|cleaning/i.test(account.Name)
  );
  if (preferred?.Id) return preferred.Id;
  if (accounts[0]?.Id) return accounts[0].Id;

  const cogsAccounts = await qbQuery<{ Id: string; Name: string }>(
    realmId,
    accessToken,
    "select Id, Name from Account where AccountType='Cost of Goods Sold' MAXRESULTS 10"
  );
  const cogsPreferred = cogsAccounts.find((account) =>
    /payroll|salary|salaries|wage|labor|labour|staff|cleaning/i.test(account.Name)
  );
  if (cogsPreferred?.Id) return cogsPreferred.Id;
  if (cogsAccounts[0]?.Id) return cogsAccounts[0].Id;

  throw new Error(
    'No expense account found in QuickBooks. Add an Expense account (e.g. Payroll or Salaries) in your Chart of Accounts.'
  );
}

async function findOrCreateCustomer(
  companyId: number,
  realmId: string,
  accessToken: string,
  invoice: Pick<ClientInvoice, 'clientName' | 'clientEmail' | 'clientPhone' | 'clientAddress'>
): Promise<string> {
  const cached = await prisma.quickBooksCustomerMap.findFirst({
    where: {
      companyId,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail ?? null,
    },
  });
  if (cached) return cached.quickbooksCustomerId;

  if (invoice.clientEmail) {
    const found = await qbQuery<{ Id: string }>(
      realmId,
      accessToken,
      `select Id from Customer where PrimaryEmailAddr = '${invoice.clientEmail.replace(/'/g, "\\'")}' MAXRESULTS 1`
    );
    if (found[0]?.Id) {
      await prisma.quickBooksCustomerMap.create({
        data: {
          companyId,
          clientName: invoice.clientName,
          clientEmail: invoice.clientEmail,
          quickbooksCustomerId: found[0].Id,
        },
      });
      return found[0].Id;
    }
  }

  const payload: Record<string, unknown> = {
    DisplayName: invoice.clientName,
  };
  if (invoice.clientEmail) payload.PrimaryEmailAddr = { Address: invoice.clientEmail };
  if (invoice.clientPhone) payload.PrimaryPhone = { FreeFormNumber: invoice.clientPhone };
  if (invoice.clientAddress) payload.BillAddr = { Line1: invoice.clientAddress };

  const created = await qbApiRequest<{ Customer: { Id: string } }>(
    realmId,
    accessToken,
    'POST',
    `/v3/company/${realmId}/customer`,
    payload
  );

  await prisma.quickBooksCustomerMap.create({
    data: {
      companyId,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      quickbooksCustomerId: created.Customer.Id,
    },
  });

  return created.Customer.Id;
}

export async function logQuickBooksActivity(
  companyId: number,
  invoiceId: number | null,
  action: string,
  status: 'success' | 'failed',
  message?: string,
  payrollRecordId?: number | null
) {
  await prisma.quickBooksSyncLog.create({
    data: { companyId, invoiceId, payrollRecordId: payrollRecordId ?? null, action, status, message },
  });
}

export async function syncClientInvoiceToQuickBooks(
  companyId: number,
  invoiceId: number
): Promise<{ quickbooksInvoiceId: string; docNumber?: string }> {
  const invoice = await prisma.clientInvoice.findFirst({
    where: { id: invoiceId, companyId },
  });
  if (!invoice) throw new Error('Invoice not found');

  if (invoice.quickbooksSyncStatus === 'synced' && invoice.quickbooksInvoiceId) {
    return {
      quickbooksInvoiceId: invoice.quickbooksInvoiceId,
      docNumber: invoice.quickbooksDocNumber ?? undefined,
    };
  }

  await prisma.clientInvoice.update({
    where: { id: invoiceId },
    data: { quickbooksSyncStatus: 'pending', quickbooksSyncError: null },
  });

  try {
    const { accessToken, realmId } = await getQuickBooksAccessToken(companyId);
    const customerId = await findOrCreateCustomer(companyId, realmId, accessToken, invoice);
    const serviceItemId = await ensureServiceItem(realmId, accessToken);

    const lineItems = JSON.parse(invoice.lineItems) as InvoiceLineItem[];
    const lines = lineItems.map((item) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: Number(item.amount),
      Description: item.description,
      SalesItemLineDetail: {
        ItemRef: { value: serviceItemId },
        Qty: Number(item.quantity) || 1,
        UnitPrice: Number(item.unitPrice),
      },
    }));

    const payload: Record<string, unknown> = {
      CustomerRef: { value: customerId },
      Line: lines,
      DocNumber: invoice.invoiceNumber.slice(0, 21),
      PrivateNote: `TidyFlow invoice #${invoice.invoiceNumber}${invoice.taskId ? ` · Task ${invoice.taskId}` : ''}`,
    };

    if (invoice.dueDate) payload.DueDate = invoice.dueDate.toISOString().slice(0, 10);
    if (invoice.clientEmail) {
      payload.BillEmail = { Address: invoice.clientEmail };
    }

    const created = await qbApiRequest<{ Invoice: { Id: string; DocNumber?: string } }>(
      realmId,
      accessToken,
      'POST',
      `/v3/company/${realmId}/invoice`,
      payload
    );

    const qbId = created.Invoice.Id;
    const docNumber = created.Invoice.DocNumber;

    await prisma.clientInvoice.update({
      where: { id: invoiceId },
      data: {
        quickbooksInvoiceId: qbId,
        quickbooksDocNumber: docNumber ?? invoice.invoiceNumber,
        quickbooksSyncStatus: 'synced',
        quickbooksSyncedAt: new Date(),
        quickbooksSyncError: null,
      },
    });

    await prisma.quickBooksConnection.update({
      where: { companyId },
      data: {
        lastSyncAt: new Date(),
        invoicesSynced: { increment: 1 },
      },
    });

    await logQuickBooksActivity(
      companyId,
      invoiceId,
      'sync_invoice',
      'success',
      `Synced ${invoice.invoiceNumber} to QuickBooks`
    );

    return { quickbooksInvoiceId: qbId, docNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    await prisma.clientInvoice.update({
      where: { id: invoiceId },
      data: { quickbooksSyncStatus: 'failed', quickbooksSyncError: message },
    });
    await logQuickBooksActivity(companyId, invoiceId, 'sync_invoice', 'failed', message);
    throw error;
  }
}

export async function getQuickBooksStatus(companyId: number) {
  const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!conn) {
    return {
      connected: false,
      configured: isQuickBooksConfigured(),
    };
  }

  const [recentLogs, syncedCount, pendingCount, failedCount] = await Promise.all([
    prisma.quickBooksSyncLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.clientInvoice.count({ where: { companyId, quickbooksSyncStatus: 'synced' } }),
    prisma.clientInvoice.count({
      where: {
        companyId,
        OR: [{ quickbooksSyncStatus: null }, { quickbooksSyncStatus: 'pending' }],
        status: { in: ['sent', 'paid'] },
      },
    }),
    prisma.clientInvoice.count({ where: { companyId, quickbooksSyncStatus: 'failed' } }),
  ]);

  return {
    connected: true,
    configured: isQuickBooksConfigured(),
    realmId: conn.realmId,
    companyName: conn.qbCompanyName,
    connectedAt: conn.connectedAt.toISOString(),
    lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
    invoicesSynced: conn.invoicesSynced,
    autoSyncOnSend: conn.autoSyncOnSend,
    autoSyncOnPaid: conn.autoSyncOnPaid,
    autoSyncOnPayroll: conn.autoSyncOnPayroll,
    payrollSynced: conn.payrollSynced,
    stats: { syncedCount, pendingCount, failedCount },
    recentActivity: recentLogs.map((l) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      payrollRecordId: l.payrollRecordId,
      action: l.action,
      status: l.status,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

export async function disconnectQuickBooks(companyId: number) {
  await prisma.quickBooksConnection.deleteMany({ where: { companyId } });
  await prisma.quickBooksCustomerMap.deleteMany({ where: { companyId } });
  await prisma.quickBooksVendorMap.deleteMany({ where: { companyId } });
  await logQuickBooksActivity(companyId, null, 'disconnect', 'success', 'QuickBooks disconnected');
}

export async function updateQuickBooksSettings(
  companyId: number,
  settings: { autoSyncOnSend?: boolean; autoSyncOnPaid?: boolean; autoSyncOnPayroll?: boolean }
) {
  return prisma.quickBooksConnection.update({
    where: { companyId },
    data: settings,
  });
}

async function findOrCreateVendor(
  companyId: number,
  realmId: string,
  accessToken: string,
  user: { id: number; firstName: string | null; lastName: string | null; email: string }
): Promise<string> {
  const vendorName =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || `Employee #${user.id}`;

  const cached = await prisma.quickBooksVendorMap.findUnique({
    where: { companyId_userId: { companyId, userId: user.id } },
  });
  if (cached) return cached.quickbooksVendorId;

  const payload: Record<string, unknown> = {
    DisplayName: vendorName.slice(0, 100),
  };
  if (user.email) payload.PrimaryEmailAddr = { Address: user.email };

  const created = await qbApiRequest<{ Vendor: { Id: string } }>(
    realmId,
    accessToken,
    'POST',
    `/v3/company/${realmId}/vendor`,
    payload
  );

  await prisma.quickBooksVendorMap.create({
    data: {
      companyId,
      userId: user.id,
      vendorName,
      quickbooksVendorId: created.Vendor.Id,
    },
  });

  return created.Vendor.Id;
}

export async function syncPayrollToQuickBooks(
  companyId: number,
  payrollRecordId: number
): Promise<{ quickbooksBillId: string; docNumber?: string }> {
  const record = await prisma.payrollRecord.findFirst({
    where: { id: payrollRecordId, companyId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!record) throw new Error('Payroll record not found');

  if (record.quickbooksSyncStatus === 'synced' && record.quickbooksBillId) {
    return {
      quickbooksBillId: record.quickbooksBillId,
      docNumber: record.quickbooksDocNumber ?? undefined,
    };
  }

  await prisma.payrollRecord.update({
    where: { id: payrollRecordId },
    data: { quickbooksSyncStatus: 'pending', quickbooksSyncError: null },
  });

  try {
    const { accessToken, realmId } = await getQuickBooksAccessToken(companyId);
    const vendorId = await findOrCreateVendor(companyId, realmId, accessToken, record.user);
    const expenseAccountId = await ensurePayrollExpenseAccount(realmId, accessToken);
    const amount = Number(record.netSalary ?? record.grossSalary ?? record.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Payroll amount must be greater than zero before syncing to QuickBooks');
    }
    const periodLabel = `${new Date(record.periodStart).toLocaleDateString('en-GB')} – ${new Date(record.periodEnd).toLocaleDateString('en-GB')}`;
    const docNumber = `PAY-${record.id}`.slice(0, 21);
    const txnDate = (record.paymentDate ?? record.periodEnd ?? new Date()).toISOString().slice(0, 10);

    const payload: Record<string, unknown> = {
      VendorRef: { value: vendorId },
      DocNumber: docNumber,
      TxnDate: txnDate,
      PrivateNote: `TidyFlow payroll #${record.id} · ${periodLabel}`,
      Line: [
        {
          DetailType: 'AccountBasedExpenseLineDetail',
          Amount: amount,
          Description: `Payroll ${periodLabel}`,
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: expenseAccountId },
          },
        },
      ],
    };

    const created = await qbApiRequest<{ Bill: { Id: string; DocNumber?: string } }>(
      realmId,
      accessToken,
      'POST',
      `/v3/company/${realmId}/bill`,
      payload
    );

    const qbId = created.Bill.Id;
    const qbDoc = created.Bill.DocNumber;

    await prisma.payrollRecord.update({
      where: { id: payrollRecordId },
      data: {
        quickbooksBillId: qbId,
        quickbooksDocNumber: qbDoc ?? docNumber,
        quickbooksSyncStatus: 'synced',
        quickbooksSyncedAt: new Date(),
        quickbooksSyncError: null,
      },
    });

    await prisma.quickBooksConnection.update({
      where: { companyId },
      data: { lastSyncAt: new Date(), payrollSynced: { increment: 1 } },
    });

    await logQuickBooksActivity(
      companyId,
      null,
      'sync_payroll',
      'success',
      `Synced payroll #${record.id} to QuickBooks`,
      payrollRecordId
    );

    return { quickbooksBillId: qbId, docNumber: qbDoc };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    await prisma.payrollRecord.update({
      where: { id: payrollRecordId },
      data: { quickbooksSyncStatus: 'failed', quickbooksSyncError: message },
    });
    await logQuickBooksActivity(
      companyId,
      null,
      'sync_payroll',
      'failed',
      message,
      payrollRecordId
    );
    throw error;
  }
}

export async function maybeAutoSyncPayroll(companyId: number, payrollRecordId: number) {
  const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!conn?.autoSyncOnPayroll) return null;
  try {
    return await syncPayrollToQuickBooks(companyId, payrollRecordId);
  } catch (error) {
    console.error('QuickBooks payroll auto-sync failed:', error);
    return null;
  }
}

export async function maybeAutoSyncInvoice(companyId: number, invoiceId: number, trigger: 'send' | 'paid') {
  const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!conn) return null;

  const shouldSync =
    (trigger === 'send' && conn.autoSyncOnSend) || (trigger === 'paid' && conn.autoSyncOnPaid);
  if (!shouldSync) return null;

  try {
    return await syncClientInvoiceToQuickBooks(companyId, invoiceId);
  } catch (error) {
    console.error('QuickBooks auto-sync failed:', error);
    return null;
  }
}
