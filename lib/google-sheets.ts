import { google, sheets_v4 } from 'googleapis';
import prisma from '@/lib/prisma';
import { notifyManagersSheetStatusBlocked } from '@/lib/notifications';

export const SHEET_TEMPLATE = {
  propertiesTab: 'Properties',
  tasksTab: 'Tasks',
  propertyColumns: [
    'Property ID',
    'Address',
    'Postcode',
    'Property Type',
    'Unit Count',
    'Client Name',
    'Client Email',
    'Client Phone',
    'Default Service Rate',
    'Notes',
    'Active',
  ],
  taskColumns: [
    'Task ID',
    'Property ID',
    'Title',
    'Description',
    'Scheduled Date',
    'Move In Date',
    'Status',
    'Assigned User Email',
    'Budget',
    'Unique ID',
  ],
};

export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || null;
}

function getServiceAccountCredentials() {
  const json =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed?.client_email && parsed?.private_key) {
        return parsed;
      }
    } catch {
      /* fall through */
    }
  }
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY
  )?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    return { client_email: clientEmail, private_key: privateKey };
  }
  return null;
}

export function getServiceAccountEmail(): string | null {
  const creds = getServiceAccountCredentials();
  if (creds?.client_email) return creds.client_email;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed?.client_email) return parsed.client_email;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function isGoogleSheetsConfigured(): boolean {
  return !!getServiceAccountCredentials();
}

async function getSheetsClient(writeAccess = false): Promise<sheets_v4.Sheets> {
  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    throw new Error(
      'Google Sheets not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: writeAccess
      ? ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly']
      : [
          'https://www.googleapis.com/auth/spreadsheets.readonly',
          'https://www.googleapis.com/auth/drive.readonly',
        ],
  });
  return google.sheets({ version: 'v4', auth });
}

const VALID_TASK_STATUSES = new Set([
  'DRAFT',
  'PLANNED',
  'ASSIGNED',
  'IN_PROGRESS',
  'SUBMITTED',
  'QA_REVIEW',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
  'COMPLETED',
  'RESERVED',
  'AWAITING',
]);

/** Per-row skip after outbound push — avoids whole-sheet sync blackout. */
const outboundSheetRowGuard = new Map<number, Map<string, number>>();

export function markOutboundSheetRow(companyId: number, uniqueId: string, durationMs = 1800) {
  if (!uniqueId.trim()) return;
  if (!outboundSheetRowGuard.has(companyId)) {
    outboundSheetRowGuard.set(companyId, new Map());
  }
  outboundSheetRowGuard.get(companyId)!.set(uniqueId.trim(), Date.now() + durationMs);
}

function shouldSkipInboundSheetRow(companyId: number, uniqueId: string): boolean {
  const key = uniqueId.trim();
  if (!key) return false;
  const rowMap = outboundSheetRowGuard.get(companyId);
  const until = rowMap?.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    rowMap!.delete(key);
    return false;
  }
  return true;
}

/** @deprecated Whole-company guard — prefer markOutboundSheetRow */
export function markOutboundSheetWrite(companyId: number, durationMs = 8000) {
  void companyId;
  void durationMs;
}

export function shouldSkipInboundSheetSync(_companyId: number): boolean {
  return false;
}

const ARCHIVE_TASK_STATUSES = new Set([
  'ARCHIVED',
  'CANCELLED',
  'CANCELED',
  'DELETED',
  'VOID',
  'REMOVE',
  'REMOVED',
]);

/** Statuses from sheet that require an assigned cleaner before applying. */
const SHEET_STATUSES_REQUIRING_CLEANER = new Set(['ASSIGNED', 'APPROVED', 'COMPLETED']);

async function taskHasAssignedCleaner(
  companyId: number,
  assignedUserId: number | undefined,
  existingTaskId?: number,
  resolvedCleanerIds?: number[]
): Promise<boolean> {
  if (assignedUserId || (resolvedCleanerIds && resolvedCleanerIds.length > 0)) return true;
  if (!existingTaskId) return false;
  const task = await prisma.task.findFirst({
    where: { id: existingTaskId, companyId },
    select: {
      assignedUserId: true,
      taskAssignments: { select: { userId: true }, take: 1 },
    },
  });
  return !!(task?.assignedUserId || task?.taskAssignments?.length);
}

/** Only alert managers when a row newly enters (or re-enters) a blocked state — not on every sync pass. */
function shouldNotifySheetStatusBlocked(
  existingTask: { status: string } | null | undefined,
  statusRaw: string,
  hasCleaner: boolean,
  hadCleanerBefore: boolean
): boolean {
  if (!SHEET_STATUSES_REQUIRING_CLEANER.has(statusRaw) || hasCleaner) return false;
  if (!existingTask) return true;
  if (existingTask.status !== statusRaw) return true;
  if (hadCleanerBefore && !hasCleaner) return true;
  return false;
}

function parseAssigneeEmails(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

async function resolveCleanerIdsFromEmails(
  companyId: number,
  raw?: string | null
): Promise<number[]> {
  const emails = parseAssigneeEmails(raw);
  if (!emails.length) return [];

  const users = await prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
    },
    select: { id: true, email: true },
  });

  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  const ids: number[] = [];
  for (const email of emails) {
    const id = byEmail.get(email.toLowerCase());
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function applyTaskAssigneesFromSheet(taskId: number, cleanerIds: number[]): Promise<void> {
  if (!cleanerIds.length) return;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      assignedUserId: cleanerIds[0],
      taskAssignments: {
        deleteMany: {},
        create: cleanerIds.map((userId) => ({ userId })),
      },
    },
  });
}

function formatAssigneeEmailsForSheet(task: {
  assignedUser?: { email: string } | null;
  taskAssignments?: Array<{ user: { email: string } }>;
}): string {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (email?: string | null) => {
    const e = email?.trim();
    if (!e) return;
    const key = e.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(e);
  };
  add(task.assignedUser?.email);
  for (const a of task.taskAssignments || []) add(a.user.email);
  return ordered.join(', ');
}

export interface TaskSyncChangeDetail {
  taskId: number;
  changed: Record<string, unknown>;
}

function collectTaskFieldChanges(
  existing: {
    title: string;
    status: string;
    description: string | null;
    scheduledDate: Date | null;
    moveInDate: Date | null;
    budget: unknown;
    assignedUserId: number | null;
  },
  next: {
    title: string;
    status: string;
    description: string | null;
    scheduledDate: Date | null;
    moveInDate: Date | null;
    budget: unknown;
    assignedUserId?: number;
  }
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  if (existing.title !== next.title) changed.title = next.title;
  if (existing.status !== next.status) changed.status = next.status;
  if ((existing.description || '') !== (next.description || '')) changed.description = next.description;
  if (existing.scheduledDate?.getTime() !== next.scheduledDate?.getTime()) {
    changed.scheduledDate = next.scheduledDate?.toISOString() ?? null;
  }
  if (existing.moveInDate?.getTime() !== next.moveInDate?.getTime()) {
    changed.moveInDate = next.moveInDate?.toISOString() ?? null;
  }
  const existingBudget = existing.budget != null ? Number(existing.budget) : null;
  const nextBudget = next.budget != null ? Number(next.budget) : null;
  if (existingBudget !== nextBudget) changed.budget = nextBudget;
  const nextAssigned = next.assignedUserId ?? existing.assignedUserId;
  if (existing.assignedUserId !== nextAssigned) changed.assignedUserId = nextAssigned;
  return changed;
}

/** Exported for API routes to pass fresh assignee data into sheet push (avoids re-fetch race). */
export function buildAssigneeEmailsForSheet(task: {
  assignedUser?: { email: string } | null;
  taskAssignments?: Array<{ user: { email: string } }>;
}): string {
  return formatAssigneeEmailsForSheet(task);
}

function findAssigneeEmailColumnIndex(headers: string[]): number {
  const exact = findHeaderIndex(
    headers,
    'Assigned User Email',
    'assigned_user_email',
    'Assigned Cleaner Email',
    'Assign Cleaner Email',
    'Assign Cleaners Email',
    'Cleaner Email',
    'Cleaner Emails',
    'Assignee Email',
    'Assigned Email'
  );
  if (exact >= 0) return exact;

  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeaderKey(headers[i]);
    if (!h) continue;
    if (
      (h.includes('assign') && h.includes('email')) ||
      (h.includes('cleaner') && h.includes('email')) ||
      h === 'assignee' ||
      h === 'assignee email'
    ) {
      return i;
    }
  }
  return -1;
}

function pickAssigneeEmailFromRow(data: Record<string, string>): string {
  const direct = pickField(
    data,
    'Assigned User Email',
    'assigned_user_email',
    'Assigned Cleaner Email',
    'Assign Cleaner Email',
    'Assign Cleaners Email',
    'Cleaner Email',
    'Cleaner Emails',
    'Assignee Email',
    'Assigned Email'
  );
  if (direct) return direct;

  for (const [key, value] of Object.entries(data)) {
    if (!value?.trim()) continue;
    const k = normalizeHeaderKey(key);
    if (
      (k.includes('assign') && k.includes('email')) ||
      (k.includes('cleaner') && k.includes('email'))
    ) {
      return value.trim();
    }
  }
  return '';
}

export function detectMasterSheetTabs(tabNames: string[]) {
  const propertiesTab =
    tabNames.find((n) => /^properties$/i.test(n.trim())) ||
    tabNames.find((n) => /propert/i.test(n) && !/task/i.test(n)) ||
    SHEET_TEMPLATE.propertiesTab;
  const tasksTab =
    tabNames.find((n) => /^tasks$/i.test(n.trim())) ||
    tabNames.find((n) => /task/i.test(n)) ||
    SHEET_TEMPLATE.tasksTab;
  return { propertiesTab, tasksTab };
}

function headersMatchTemplate(propertiesHeaders: string[], tasksHeaders: string[]) {
  const hasPropId = (headers: string[]) =>
    headers.some((h) => /property\s*id/i.test(h.trim()));
  const hasTitle = tasksHeaders.some((h) => /^title$/i.test(h.trim()));
  return hasPropId(propertiesHeaders) && hasPropId(tasksHeaders) && hasTitle;
}

export async function verifySpreadsheet(sheetUrl: string) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Sheets URL');
  }

  if (!isGoogleSheetsConfigured()) {
    const { propertiesTab, tasksTab } = detectMasterSheetTabs([
      SHEET_TEMPLATE.propertiesTab,
      SHEET_TEMPLATE.tasksTab,
    ]);
    return {
      spreadsheetId,
      spreadsheetTitle: 'Preview (service account not configured on server)',
      sheets: [SHEET_TEMPLATE.propertiesTab, SHEET_TEMPLATE.tasksTab],
      defaultSheet: propertiesTab,
      headers: SHEET_TEMPLATE.propertyColumns,
      propertiesTab,
      tasksTab,
      propertiesHeaders: SHEET_TEMPLATE.propertyColumns,
      tasksHeaders: SHEET_TEMPLATE.taskColumns,
      templateMatch: true,
      serviceAccountEmail: getServiceAccountEmail(),
      configured: false,
    };
  }

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tabNames = meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) as string[];
  const { propertiesTab, tasksTab } = detectMasterSheetTabs(tabNames);
  const defaultSheet = tabNames.includes(propertiesTab) ? propertiesTab : tabNames[0] || propertiesTab;

  const propertiesHeaders = tabNames.includes(propertiesTab)
    ? await getSheetHeaders(spreadsheetId, propertiesTab)
    : [];
  const tasksHeaders = tabNames.includes(tasksTab)
    ? await getSheetHeaders(spreadsheetId, tasksTab)
    : [];

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${defaultSheet}'!1:1`,
  });
  const headers = (headerRes.data.values?.[0] || []).map((h) => String(h || '').trim());

  return {
    spreadsheetId,
    spreadsheetTitle: meta.data.properties?.title || 'Spreadsheet',
    sheets: tabNames,
    defaultSheet,
    headers,
    propertiesTab,
    tasksTab,
    propertiesHeaders,
    tasksHeaders,
    templateMatch: headersMatchTemplate(propertiesHeaders, tasksHeaders),
    serviceAccountEmail: getServiceAccountEmail(),
    configured: true,
  };
}

export async function getSheetHeaders(spreadsheetId: string, sheetName: string) {
  if (!isGoogleSheetsConfigured()) {
    return sheetName.toLowerCase().includes('task')
      ? SHEET_TEMPLATE.taskColumns
      : SHEET_TEMPLATE.propertyColumns;
  }
  const sheets = await getSheetsClient();
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!1:1`,
  });
  return (headerRes.data.values?.[0] || []).map((h) => String(h || '').trim());
}

export async function getCompanySheetConnection(companyId: number) {
  return prisma.companyGoogleSheet.findUnique({ where: { companyId } });
}

export async function assertNoExistingConnection(companyId: number) {
  const existing = await getCompanySheetConnection(companyId);
  if (existing) {
    throw new Error(
      'Your company already has a Google Sheet connected. Disconnect it before connecting a different sheet.'
    );
  }
}

export async function connectCompanySheet(
  companyId: number,
  input: {
    sheetUrl: string;
    propertiesTab?: string;
    tasksTab?: string;
    propertiesMapping?: Record<string, string>;
    tasksMapping?: Record<string, string>;
    uniqueColumn?: string;
  }
) {
  await assertNoExistingConnection(companyId);
  const verified = await verifySpreadsheet(input.sheetUrl);

  const connection = await prisma.companyGoogleSheet.create({
    data: {
      companyId,
      spreadsheetId: verified.spreadsheetId,
      spreadsheetUrl: input.sheetUrl,
      spreadsheetTitle: verified.spreadsheetTitle,
      propertiesTab: input.propertiesTab || SHEET_TEMPLATE.propertiesTab,
      tasksTab: input.tasksTab || SHEET_TEMPLATE.tasksTab,
      propertiesMapping: input.propertiesMapping
        ? JSON.stringify(input.propertiesMapping)
        : null,
      tasksMapping: input.tasksMapping ? JSON.stringify(input.tasksMapping) : null,
      uniqueColumn: input.uniqueColumn || null,
      syncEnabled: true,
    },
  });

  try {
    await syncCompanyGoogleSheet(companyId);
  } catch (error: any) {
    await prisma.companyGoogleSheet.update({
      where: { companyId },
      data: { lastSyncError: error.message },
    });
  }

  return connection;
}

export async function disconnectCompanySheet(companyId: number) {
  const conn = await getCompanySheetConnection(companyId);
  if (!conn) return null;

  if (conn.watchChannelId && conn.watchResourceId && isGoogleSheetsConfigured()) {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: getServiceAccountCredentials()!,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      const drive = google.drive({ version: 'v3', auth });
      await drive.channels.stop({
        requestBody: { id: conn.watchChannelId, resourceId: conn.watchResourceId },
      });
    } catch {
      /* channel may already be expired */
    }
  }

  await prisma.companyGoogleSheet.delete({ where: { companyId } });
  return conn;
}

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => {
    const trimmed = String(h || '').trim();
    if (!trimmed) return;
    const value = row[i] ?? '';
    obj[trimmed] = value;
    obj[normalizeHeaderKey(trimmed)] = value;
  });
  return obj;
}

/** Read a cell value using exact or case-insensitive header names. */
function pickField(data: Record<string, string>, ...candidates: string[]): string {
  for (const key of candidates) {
    const trimmed = key.trim();
    const value = data[trimmed] ?? data[normalizeHeaderKey(trimmed)];
    if (value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/** Parse numeric sheet values (strips currency symbols and thousands separators). */
function parseSheetNumber(raw?: string | null): number | null {
  if (!raw?.trim()) return null;
  const cleaned = raw
    .trim()
    .replace(/[£$€,\s]/g, '')
    .replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePropertiesMapping(conn: { propertiesMapping?: string | null }): Record<string, string> | null {
  if (!conn.propertiesMapping) return null;
  try {
    const parsed = JSON.parse(conn.propertiesMapping);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Resolve a DB field from custom column mapping (sheet column → field name). */
function pickMappedField(
  data: Record<string, string>,
  mapping: Record<string, string>,
  fieldName: string
): string {
  for (const [sheetColumn, mappedField] of Object.entries(mapping)) {
    if (mappedField === fieldName) {
      const value = pickField(data, sheetColumn);
      if (value) return value;
    }
  }
  return '';
}

function resolveDefaultServiceRate(
  data: Record<string, string>,
  mapping: Record<string, string> | null
): number | null {
  const raw = mapping
    ? pickMappedField(data, mapping, 'defaultServiceRate')
    : pickField(
        data,
        'Default Service Rate',
        'default_service_rate',
        'Default Service Rate (£)',
        'Service Rate',
        'Default Rate',
        'Rate'
      );
  const rate = parseSheetNumber(raw);
  return rate != null && rate > 0 ? rate : null;
}

function buildPropertySyncPayload(
  data: Record<string, string>,
  conn: {
    spreadsheetId: string;
    spreadsheetUrl: string;
    propertiesTab: string;
    propertiesMapping?: string | null;
  }
) {
  const mapping = parsePropertiesMapping(conn);
  const externalId = mapping
    ? pickMappedField(data, mapping, 'propertyId') ||
      pickMappedField(data, mapping, 'externalId') ||
      pickField(data, 'Property ID', 'property_id', 'PropertyID')
    : pickField(data, 'Property ID', 'property_id', 'PropertyID');

  const address = mapping
    ? pickMappedField(data, mapping, 'address') || pickField(data, 'Address', 'address')
    : pickField(data, 'Address', 'address');

  const isActive = !['no', 'false', '0', 'inactive'].includes(
    String(
      mapping
        ? pickMappedField(data, mapping, 'isActive') || pickField(data, 'Active', 'active')
        : pickField(data, 'Active', 'active') || 'yes'
    ).toLowerCase()
  );

  const sheetNotes = mapping
    ? pickMappedField(data, mapping, 'notes') || pickField(data, 'Notes', 'notes')
    : pickField(data, 'Notes', 'notes');

  const notesParts: string[] = [];
  if (externalId) notesParts.push(`sheet:${externalId}`);
  if (sheetNotes && !sheetNotes.startsWith('sheet:')) notesParts.push(sheetNotes);

  return {
    externalId,
    address: address.trim(),
    payload: {
      address: address.trim(),
      postcode:
        (mapping ? pickMappedField(data, mapping, 'postcode') : '') ||
        pickField(data, 'Postcode', 'postcode') ||
        null,
      propertyType: (
        (mapping ? pickMappedField(data, mapping, 'propertyType') : '') ||
        pickField(data, 'Property Type', 'property_type') ||
        'apartment'
      ).toLowerCase(),
      unitCount: Math.max(
        1,
        Math.round(
          parseSheetNumber(
            (mapping ? pickMappedField(data, mapping, 'unitCount') : '') ||
              pickField(data, 'Unit Count', 'unit_count')
          ) ?? 1
        )
      ),
      clientName:
        (mapping ? pickMappedField(data, mapping, 'clientName') : '') ||
        pickField(data, 'Client Name', 'client_name') ||
        null,
      clientEmail:
        (mapping ? pickMappedField(data, mapping, 'clientEmail') : '') ||
        pickField(data, 'Client Email', 'client_email') ||
        null,
      clientPhone:
        (mapping ? pickMappedField(data, mapping, 'clientPhone') : '') ||
        pickField(data, 'Client Phone', 'client_phone') ||
        null,
      defaultServiceRate: resolveDefaultServiceRate(data, mapping),
      notes: notesParts.length ? notesParts.join('\n') : null,
      isActive,
      sheetSyncEnabled: true,
      googleSheetId: conn.spreadsheetId,
      googleSheetUrl: conn.spreadsheetUrl,
      googleSheetName: conn.propertiesTab,
      sheetLastSyncedAt: new Date(),
    },
  };
}

function parseSheetDate(raw?: string | null): Date | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();

  // Google Sheets serial date (days since 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed);
    if (serial > 0 && serial < 1000000) {
      const epoch = new Date(1899, 11, 30);
      const date = new Date(epoch.getTime() + serial * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/').map(Number);
    const date = new Date(y, m - 1, d);
    if (!isNaN(date.getTime()) && date.getDate() === d && date.getMonth() === m - 1) {
      return date;
    }
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100) {
    return d;
  }
  return null;
}

function dateToSheetSerial(date: Date): number {
  const epoch = new Date(1899, 11, 30);
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return (midnight.getTime() - epoch.getTime()) / (24 * 60 * 60 * 1000);
}

function normalizeSheetStatus(raw?: string | null): string | null {
  if (!raw?.trim()) return 'PLANNED';
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '_');
  return VALID_TASK_STATUSES.has(normalized) ? normalized : null;
}

function findHeaderIndex(headers: string[], ...candidates: string[]): number {
  const normalized = headers.map((h) => normalizeHeaderKey(h));
  for (const candidate of candidates) {
    const key = normalizeHeaderKey(candidate);
    const idx = normalized.indexOf(key);
    if (idx >= 0) return idx;
  }
  return -1;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function extractPropertySheetRef(notes?: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/sheet:([^\s\n]+)/);
  return match?.[1] || null;
}

function findPropertyBySheetRef(companyId: number, propertyRef: string) {
  return prisma.property.findFirst({
    where: {
      companyId,
      OR: [
        { notes: { contains: `sheet:${propertyRef}` } },
        ...(/^\d+$/.test(propertyRef) ? [{ id: Number(propertyRef) }] : []),
      ],
    },
  });
}

export async function syncCompanySheet(companyId: number) {
  const conn = await getCompanySheetConnection(companyId);
  if (!conn) throw new Error('No Google Sheet connected for this company');
  if (!conn.propertiesTab || !conn.tasksTab) {
    throw new Error('Master sheet tabs are not configured. Reconnect your sheet in Properties.');
  }
  if (!isGoogleSheetsConfigured()) {
    throw new Error('Google Sheets service account is not configured on the server');
  }

  const sheets = await getSheetsClient();
  const propertiesHeaders = await getSheetHeaders(conn.spreadsheetId, conn.propertiesTab);
  const propertiesRes = await sheets.spreadsheets.values.get({
    spreadsheetId: conn.spreadsheetId,
    range: `'${conn.propertiesTab}'!A2:Z5000`,
  });
  const propertyRows = propertiesRes.data.values || [];

  let propertiesSynced = 0;
  let propertiesDeactivated = 0;
  const propertiesCreated: number[] = [];
  const propertiesUpdated: number[] = [];

  for (const row of propertyRows) {
    const data = rowToObject(propertiesHeaders, row.map(String));
    const { externalId, address, payload } = buildPropertySyncPayload(data, conn);
    if (!address) continue;

    const existing = externalId
      ? await prisma.property.findFirst({
          where: {
            companyId,
            OR: [
              { notes: { contains: `sheet:${externalId}` } },
              ...(/^\d+$/.test(externalId) ? [{ id: Number(externalId) }] : []),
            ],
          },
        })
      : await prisma.property.findFirst({
          where: { companyId, address: { equals: address, mode: 'insensitive' } },
        });

    const isActive = payload.isActive;

    if (existing) {
      await prisma.property.update({ where: { id: existing.id }, data: payload });
      propertiesUpdated.push(existing.id);
      if (!isActive) propertiesDeactivated++;
    } else if (isActive) {
      const { checkPlanLimit } = await import('@/lib/subscription');
      const limit = await checkPlanLimit(companyId, 'properties');
      if (!limit.allowed) {
        continue;
      }
      const created = await prisma.property.create({ data: { companyId, ...payload } });
      propertiesCreated.push(created.id);
    }
    if (isActive) propertiesSynced++;
  }

  const tasksHeaders = await getSheetHeaders(conn.spreadsheetId, conn.tasksTab);
  const tasksRes = await sheets.spreadsheets.values.get({
    spreadsheetId: conn.spreadsheetId,
    range: `'${conn.tasksTab}'!A2:Z10000`,
  });
  const taskRows = tasksRes.data.values || [];
  let tasksSynced = 0;
  let tasksArchived = 0;
  let statusBlocked = 0;
  let rowErrors = 0;
  const tasksCreated: number[] = [];
  const tasksUpdated: number[] = [];
  const tasksUpdatedDetails: TaskSyncChangeDetail[] = [];

  for (const row of taskRows) {
    try {
      const data = rowToObject(tasksHeaders, row.map(String));
      const title = data['Title'] || data['title'];
      const propertyRef = data['Property ID'] || data['property_id'];
      if (!propertyRef?.trim()) continue;

      const property = await findPropertyBySheetRef(companyId, propertyRef.trim());
      if (!property) continue;

      const uniqueId =
        data['Unique ID'] ||
        data['unique_id'] ||
        data['Task ID'] ||
        data['task_id'] ||
        `${propertyRef}-${title || 'task'}`;

      if (shouldSkipInboundSheetRow(companyId, uniqueId)) continue;

      const existingTask = await prisma.task.findFirst({
        where: { companyId, uniqueIdentifier: uniqueId },
        select: {
          id: true,
          title: true,
          status: true,
          description: true,
          scheduledDate: true,
          moveInDate: true,
          budget: true,
          assignedUserId: true,
        },
      });

      const statusRaw = normalizeSheetStatus(data['Status'] || data['status'] || 'PLANNED');
      if (!statusRaw) {
        console.warn(
          `[sheet-sync] Skipping row — invalid status "${data['Status'] || data['status']}" for task "${title || uniqueId}"`
        );
        rowErrors++;
        continue;
      }

      if (ARCHIVE_TASK_STATUSES.has(statusRaw)) {
        if (existingTask) {
          await prisma.task.update({
            where: { id: existingTask.id },
            data: { status: 'ARCHIVED' },
          });
          tasksArchived++;
          tasksUpdated.push(existingTask.id);
        }
        continue;
      }

      if (!title?.trim()) continue;

      const scheduledDate = parseSheetDate(data['Scheduled Date'] || data['scheduled_date']);
      const moveInDate = parseSheetDate(data['Move In Date'] || data['move_in_date']);

      const assigneeRaw = pickAssigneeEmailFromRow(data);
      const cleanerIds = await resolveCleanerIdsFromEmails(companyId, assigneeRaw);
      const assignedUserId = cleanerIds[0];

      const hadCleanerBefore = existingTask
        ? await taskHasAssignedCleaner(companyId, undefined, existingTask.id)
        : false;
      const hasCleaner = await taskHasAssignedCleaner(
        companyId,
        assignedUserId,
        existingTask?.id,
        cleanerIds
      );

      if (SHEET_STATUSES_REQUIRING_CLEANER.has(statusRaw) && !hasCleaner) {
        if (shouldNotifySheetStatusBlocked(existingTask, statusRaw, hasCleaner, hadCleanerBefore)) {
          await notifyManagersSheetStatusBlocked({
            companyId,
            taskTitle: title!.trim(),
            requestedStatus: statusRaw,
            propertyRef: propertyRef.trim(),
            spreadsheetTitle: conn.spreadsheetTitle || undefined,
          });
        }
        statusBlocked++;
        if (existingTask) {
          await prisma.task.update({
            where: { id: existingTask.id },
            data: {
              title: title.trim(),
              description: data['Description'] || data['description'] || null,
              scheduledDate,
              moveInDate,
              budget: (() => {
                const n = parseSheetNumber(pickField(data, 'Budget', 'budget'));
                return n != null && n > 0 ? n : null;
              })(),
              uniqueIdentifier: uniqueId,
              propertyId: property.id,
              ...(assignedUserId ? { assignedUserId } : {}),
            },
          });
          if (cleanerIds.length) {
            await applyTaskAssigneesFromSheet(existingTask.id, cleanerIds);
          }
          tasksUpdated.push(existingTask.id);
        }
        continue;
      }

      const taskPayload = {
        title: title.trim(),
        description: data['Description'] || data['description'] || null,
        scheduledDate,
        moveInDate,
        status: statusRaw as any,
        budget: (() => {
          const n = parseSheetNumber(pickField(data, 'Budget', 'budget'));
          return n != null && n > 0 ? n : null;
        })(),
        uniqueIdentifier: uniqueId,
        propertyId: property.id,
        ...(assignedUserId ? { assignedUserId } : {}),
      };

      let syncedTaskId: number;
      if (existingTask) {
        const fieldChanges = collectTaskFieldChanges(existingTask, {
          ...taskPayload,
          assignedUserId: assignedUserId ?? existingTask.assignedUserId ?? undefined,
        });
        const updated = await prisma.task.update({ where: { id: existingTask.id }, data: taskPayload });
        syncedTaskId = updated.id;
        if (Object.keys(fieldChanges).length > 0) {
          tasksUpdated.push(existingTask.id);
          tasksUpdatedDetails.push({
            taskId: existingTask.id,
            changed: { ...fieldChanges, propertyId: property.id },
          });
        }
      } else {
        const created = await prisma.task.create({ data: { companyId, ...taskPayload } });
        syncedTaskId = created.id;
        tasksCreated.push(created.id);
      }
      if (cleanerIds.length) {
        await applyTaskAssigneesFromSheet(syncedTaskId, cleanerIds);
      }
      tasksSynced++;
    } catch (rowError) {
      rowErrors++;
      console.error('[sheet-sync] Task row failed — continuing with remaining rows:', rowError);
    }
  }

  await prisma.companyGoogleSheet.update({
    where: { companyId },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });

  let geocodeResult = { geocoded: 0, failed: 0, skipped: 0 };
  const idsToGeocode = [...propertiesCreated, ...propertiesUpdated];
  if (idsToGeocode.length) {
    try {
      const { geocodePropertiesByIds } = await import('@/lib/geocoding');
      geocodeResult = await geocodePropertiesByIds(companyId, idsToGeocode);
    } catch (err) {
      console.warn('[syncCompanySheet] property geocoding failed:', err);
    }
  }

  return {
    propertiesSynced,
    tasksSynced,
    tasksArchived,
    propertiesDeactivated,
    statusBlocked,
    rowErrors,
    companyId,
    tasksCreated,
    tasksUpdated,
    tasksUpdatedDetails,
    propertiesCreated,
    propertiesUpdated,
    geocodeResult,
  };
}

export async function registerSheetWatch(companyId: number, webhookUrl: string) {
  const conn = await getCompanySheetConnection(companyId);
  if (!conn || !isGoogleSheetsConfigured()) return null;

  const channelId = `tidyflow-${companyId}-${Date.now()}`;
  const auth = new google.auth.GoogleAuth({
    credentials: getServiceAccountCredentials()!,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

  const watch = await drive.files.watch({
    fileId: conn.spreadsheetId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      expiration: String(expiration),
    },
  });

  await prisma.companyGoogleSheet.update({
    where: { companyId },
    data: {
      watchChannelId: channelId,
      watchResourceId: watch.data.resourceId || null,
      watchExpiration: new Date(expiration),
    },
  });

  return watch.data;
}

export interface TaskSheetSyncResult {
  created: number;
  updated: number;
  removed: number;
  errors: number;
  tasksCreated: number[];
  tasksUpdated: number[];
}

function mapRowToTaskFields(
  data: Record<string, string>,
  columnMapping: Record<string, string>
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [header, field] of Object.entries(columnMapping)) {
    if (data[header] !== undefined) mapped[field] = data[header];
  }
  return mapped;
}

/** Sync tasks using PropertySelectionScreen column mapping (add/update/delete via action column). */
export async function syncTaskSheetFromMapping(companyId: number): Promise<TaskSheetSyncResult> {
  const conn = await getCompanySheetConnection(companyId);
  if (!conn) throw new Error('No Google Sheet connected for this company');
  if (!conn.propertyIdColumn || !conn.actionColumn) {
    throw new Error('Task sheet mapping is not configured. Complete setup in Properties → Connect Sheet.');
  }
  if (!isGoogleSheetsConfigured()) {
    throw new Error('Google Sheets service account is not configured on the server');
  }

  let columnMapping: Record<string, string> = {};
  if (conn.tasksMapping) {
    try {
      const parsed = JSON.parse(conn.tasksMapping);
      columnMapping = parsed.columnMapping || parsed;
    } catch {
      columnMapping = {};
    }
  }

  const sheets = await getSheetsClient();
  const sheetName = conn.tasksTab;
  const headers = await getSheetHeaders(conn.spreadsheetId, sheetName);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: conn.spreadsheetId,
    range: `'${sheetName}'!A2:Z10000`,
  });
  const rows = res.data.values || [];

  const result: TaskSheetSyncResult = {
    created: 0,
    updated: 0,
    removed: 0,
    errors: 0,
    tasksCreated: [],
    tasksUpdated: [],
  };

  for (const row of rows) {
    try {
      const data = rowToObject(headers, row.map(String));
      const propertyRef = data[conn.propertyIdColumn!]?.trim();
      const action = (data[conn.actionColumn!] || 'add').toLowerCase().trim();
      if (!propertyRef) {
        result.errors++;
        continue;
      }

      const property = await prisma.property.findFirst({
        where: {
          companyId,
          OR: [
            { notes: { contains: `sheet:${propertyRef}` } },
            ...(/^\d+$/.test(propertyRef) ? [{ id: Number(propertyRef) }] : []),
          ],
        },
      });

      if (!property) {
        result.errors++;
        continue;
      }

      const mapped = mapRowToTaskFields(data, columnMapping);
      const title = mapped.title?.trim();
      if (!title && !['delete', 'remove', 'archive'].includes(action)) {
        result.errors++;
        continue;
      }

      const uniqueId =
        mapped.uniqueIdentifier ||
        data['Unique ID'] ||
        data['unique_id'] ||
        `${propertyRef}-${title || propertyRef}`;

      const existingTask = await prisma.task.findFirst({
        where: { companyId, uniqueIdentifier: uniqueId },
      });

      if (['delete', 'remove', 'archive'].includes(action)) {
        if (existingTask) {
          await prisma.task.update({
            where: { id: existingTask.id },
            data: { status: 'ARCHIVED' },
          });
          result.removed++;
          result.tasksUpdated.push(existingTask.id);
        }
        continue;
      }

      const cleanerIds = await resolveCleanerIdsFromEmails(companyId, mapped.assignedUserEmail);
      const assignedUserId = cleanerIds[0];

      const scheduledRaw = mapped.scheduledDate;
      const scheduledDate = scheduledRaw ? parseSheetDate(scheduledRaw) : null;
      const moveInDate = mapped.moveInDate ? parseSheetDate(mapped.moveInDate) : null;
      const statusRaw = normalizeSheetStatus(mapped.status || 'PLANNED');
      if (!statusRaw) {
        result.errors++;
        continue;
      }

      const hadCleanerBefore = existingTask
        ? await taskHasAssignedCleaner(companyId, undefined, existingTask.id)
        : false;
      const hasCleaner = await taskHasAssignedCleaner(
        companyId,
        assignedUserId,
        existingTask?.id,
        cleanerIds
      );

      if (SHEET_STATUSES_REQUIRING_CLEANER.has(statusRaw) && !hasCleaner) {
        if (shouldNotifySheetStatusBlocked(existingTask, statusRaw, hasCleaner, hadCleanerBefore)) {
          await notifyManagersSheetStatusBlocked({
            companyId,
            taskTitle: title!,
            requestedStatus: statusRaw,
            propertyRef,
            spreadsheetTitle: conn.spreadsheetTitle || undefined,
          });
        }
        if (existingTask) {
          await prisma.task.update({
            where: { id: existingTask.id },
            data: {
              title: title!,
              description: mapped.description || null,
              scheduledDate,
              moveInDate,
              budget: (() => {
                const n = parseSheetNumber(mapped.budget);
                return n != null && n > 0 ? n : null;
              })(),
              uniqueIdentifier: uniqueId,
              propertyId: property.id,
              ...(assignedUserId ? { assignedUserId } : {}),
            },
          });
          if (cleanerIds.length) {
            await applyTaskAssigneesFromSheet(existingTask.id, cleanerIds);
          }
          result.updated++;
          result.tasksUpdated.push(existingTask.id);
        }
        continue;
      }

      const taskPayload = {
        title: title!,
        description: mapped.description || null,
        scheduledDate,
        moveInDate,
        status: statusRaw as any,
        budget: (() => {
          const n = parseSheetNumber(mapped.budget);
          return n != null && n > 0 ? n : null;
        })(),
        uniqueIdentifier: uniqueId,
        propertyId: property.id,
        ...(assignedUserId ? { assignedUserId } : {}),
      };

      let syncedTaskId: number;
      if (existingTask) {
        const updated = await prisma.task.update({ where: { id: existingTask.id }, data: taskPayload });
        syncedTaskId = updated.id;
        result.updated++;
        result.tasksUpdated.push(existingTask.id);
      } else {
        const created = await prisma.task.create({ data: { companyId, ...taskPayload } });
        syncedTaskId = created.id;
        result.created++;
        result.tasksCreated.push(created.id);
      }
      if (cleanerIds.length) {
        await applyTaskAssigneesFromSheet(syncedTaskId, cleanerIds);
      }
    } catch {
      result.errors++;
    }
  }

  await prisma.companyGoogleSheet.update({
    where: { companyId },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });

  return result;
}

export async function saveTaskSheetConfiguration(
  companyId: number,
  input: {
    spreadsheetId: string;
    sheetName: string;
    sheetUrl?: string;
    columnMapping: Record<string, string>;
    propertyIdColumn: string;
    actionColumn: string;
  }
) {
  const existing = await getCompanySheetConnection(companyId);
  if (existing && existing.spreadsheetId !== input.spreadsheetId) {
    throw new Error(
      'Your company already has a different Google Sheet connected. Disconnect it first in Settings → Google Sheets.'
    );
  }

  const verified = input.sheetUrl
    ? await verifySpreadsheet(input.sheetUrl)
    : { spreadsheetTitle: existing?.spreadsheetTitle || 'Spreadsheet' };

  const data = {
    spreadsheetId: input.spreadsheetId,
    spreadsheetUrl: input.sheetUrl || existing?.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${input.spreadsheetId}`,
    spreadsheetTitle: verified.spreadsheetTitle,
    tasksTab: input.sheetName,
    tasksMapping: JSON.stringify({ columnMapping: input.columnMapping }),
    propertyIdColumn: input.propertyIdColumn,
    actionColumn: input.actionColumn,
    syncEnabled: true,
  };

  if (existing) {
    return prisma.companyGoogleSheet.update({ where: { companyId }, data });
  }

  return prisma.companyGoogleSheet.create({ data: { companyId, ...data } });
}

export function isMasterSheetMode(conn: {
  propertiesTab?: string | null;
  tasksTab?: string | null;
  actionColumn?: string | null;
} | null) {
  return !!(conn?.propertiesTab && conn?.tasksTab && !conn?.actionColumn);
}

export function hasSheetConfiguration(conn: {
  propertiesTab?: string | null;
  tasksTab?: string | null;
  propertyIdColumn?: string | null;
  actionColumn?: string | null;
} | null) {
  if (!conn) return false;
  return isMasterSheetMode(conn) || !!(conn.propertyIdColumn && conn.actionColumn);
}

/** Routes to master-sheet or legacy mapping sync based on saved configuration. */
export async function syncCompanyGoogleSheet(companyId: number) {
  const conn = await getCompanySheetConnection(companyId);
  if (!conn) throw new Error('No Google Sheet connected for this company');

  let result: Record<string, unknown>;
  if (conn.propertiesTab && conn.tasksTab && !conn.actionColumn) {
    result = await syncCompanySheet(companyId);
  } else if (conn.propertyIdColumn && conn.actionColumn) {
    const mappingResult = await syncTaskSheetFromMapping(companyId);
    result = {
      ...mappingResult,
      tasksSynced: mappingResult.created + mappingResult.updated,
      tasksArchived: mappingResult.removed,
      propertiesSynced: 0,
      propertiesDeactivated: 0,
      statusBlocked: 0,
      propertiesCreated: [] as number[],
      propertiesUpdated: [] as number[],
    };
  } else {
    throw new Error('Sheet configuration is incomplete. Reconnect your sheet in Properties.');
  }

  const { emitSheetSyncDelta } = await import('@/lib/realtime');
  await emitSheetSyncDelta({
    companyId,
    tasksCreated: (result.tasksCreated as number[]) || [],
    tasksUpdated: (result.tasksUpdated as number[]) || [],
    tasksUpdatedDetails: (result.tasksUpdatedDetails as TaskSyncChangeDetail[]) || [],
    propertiesCreated: (result.propertiesCreated as number[]) || [],
    propertiesUpdated: (result.propertiesUpdated as number[]) || [],
    stats: {
      propertiesSynced: result.propertiesSynced,
      tasksSynced: result.tasksSynced,
      tasksArchived: result.tasksArchived,
      propertiesDeactivated: result.propertiesDeactivated,
      statusBlocked: result.statusBlocked,
    },
  });

  const propertyIds = [
    ...((result.propertiesCreated as number[]) || []),
    ...((result.propertiesUpdated as number[]) || []),
  ];
  if (propertyIds.length && !result.geocodeResult) {
    try {
      const { geocodePropertiesByIds } = await import('@/lib/geocoding');
      result.geocodeResult = await geocodePropertiesByIds(companyId, propertyIds);
    } catch (err) {
      console.warn('[syncCompanyGoogleSheet] property geocoding failed:', err);
    }
  }

  return result;
}

const SHEET_SYNC_DEBOUNCE_MS = 600;
const pendingSheetSyncs = new Map<number, NodeJS.Timeout>();
const pendingSheetSyncResolvers = new Map<
  number,
  { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }[]
>();
const sheetSyncInFlight = new Set<number>();

async function executeCompanySheetSync(companyId: number): Promise<Record<string, unknown>> {
  sheetSyncInFlight.add(companyId);
  try {
    return await syncCompanyGoogleSheet(companyId);
  } finally {
    sheetSyncInFlight.delete(companyId);
  }
}

function flushSheetSyncWaiters(companyId: number, result: Record<string, unknown>) {
  const batch = pendingSheetSyncResolvers.get(companyId) || [];
  pendingSheetSyncResolvers.delete(companyId);
  batch.forEach((w) => w.resolve(result));
}

function rejectSheetSyncWaiters(companyId: number, error: Error) {
  const batch = pendingSheetSyncResolvers.get(companyId) || [];
  pendingSheetSyncResolvers.delete(companyId);
  batch.forEach((w) => w.reject(error));
}

async function runSheetSyncBatch(companyId: number) {
  pendingSheetSyncs.delete(companyId);
  try {
    const result = await executeCompanySheetSync(companyId);
    flushSheetSyncWaiters(companyId, result);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    rejectSheetSyncWaiters(companyId, error);
  }

  if (pendingSheetSyncResolvers.has(companyId)) {
    scheduleTrailingSheetSync(companyId);
  }
}

function scheduleTrailingSheetSync(companyId: number) {
  if (pendingSheetSyncs.has(companyId)) return;
  const timer = setTimeout(() => {
    void runSheetSyncBatch(companyId);
  }, SHEET_SYNC_DEBOUNCE_MS);
  pendingSheetSyncs.set(companyId, timer);
}

/**
 * Google Sheet webhook sync — leading edge (immediate first run) + trailing debounce for bursts.
 */
export function scheduleCompanySheetSync(companyId: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const waiters = pendingSheetSyncResolvers.get(companyId) || [];
    waiters.push({ resolve, reject });
    pendingSheetSyncResolvers.set(companyId, waiters);

    if (!sheetSyncInFlight.has(companyId) && !pendingSheetSyncs.has(companyId)) {
      void runSheetSyncBatch(companyId);
      return;
    }

    scheduleTrailingSheetSync(companyId);
  });
}

/**
 * Push task changes from the app back to the connected master Google Sheet.
 * Matches rows by Unique ID (or Task ID). Non-blocking — callers should .catch().
 */
export async function pushTaskToCompanySheet(
  companyId: number,
  taskId: number,
  hints?: { assigneeEmails?: string }
): Promise<boolean> {
  const conn = await getCompanySheetConnection(companyId);
  if (!conn?.syncEnabled || !conn.tasksTab || !isMasterSheetMode(conn)) return false;
  if (!isGoogleSheetsConfigured()) return false;

  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      scheduledDate: true,
      moveInDate: true,
      budget: true,
      uniqueIdentifier: true,
      assignedUser: { select: { email: true } },
      taskAssignments: { select: { user: { select: { email: true } } } },
      property: { select: { notes: true } },
    },
  });
  if (!task?.uniqueIdentifier) return false;

  const sheets = await getSheetsClient(true);
  const headers = await getSheetHeaders(conn.spreadsheetId, conn.tasksTab);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: conn.spreadsheetId,
    range: `'${conn.tasksTab}'!A2:ZZ10000`,
  });
  const rows = res.data.values || [];

  const uniqueCol = findHeaderIndex(headers, 'Unique ID', 'unique_id', 'unique id');
  const taskIdCol = findHeaderIndex(headers, 'Task ID', 'task_id', 'task id');
  const matchKey = task.uniqueIdentifier.trim();

  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const uniqueVal = uniqueCol >= 0 ? String(row[uniqueCol] || '').trim() : '';
    const taskIdVal = taskIdCol >= 0 ? String(row[taskIdCol] || '').trim() : '';
    if (uniqueVal === matchKey || (taskIdVal && taskIdVal === matchKey)) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex < 0) return false;

  const sheetRowNumber = rowIndex + 2;
  const updates: { col: number; value: string | number }[] = [];

  const setCell = (candidates: string[], value: string | number | null | undefined) => {
    if (value === undefined || value === null) return;
    const col = findHeaderIndex(headers, ...candidates);
    if (col >= 0) updates.push({ col, value });
  };

  setCell(['Title', 'title'], task.title);
  setCell(['Description', 'description'], task.description || '');
  setCell(['Status', 'status'], task.status);

  const assigneeEmails =
    hints?.assigneeEmails ?? formatAssigneeEmailsForSheet(task);
  const assigneeCol = findAssigneeEmailColumnIndex(headers);
  if (assigneeCol >= 0) {
    updates.push({ col: assigneeCol, value: assigneeEmails });
  } else if (assigneeEmails) {
    console.warn(
      `[sheet-push] Task ${taskId}: assignee emails resolved but no matching column in sheet headers:`,
      headers.filter(Boolean).slice(0, 20)
    );
  }
  if (task.scheduledDate) {
    setCell(['Scheduled Date', 'scheduled_date'], dateToSheetSerial(new Date(task.scheduledDate)));
  }
  if (task.moveInDate) {
    setCell(['Move In Date', 'move_in_date'], dateToSheetSerial(new Date(task.moveInDate)));
  }
  if (task.budget != null) setCell(['Budget', 'budget'], Number(task.budget));

  const propertyRef = extractPropertySheetRef(task.property?.notes);
  if (propertyRef) setCell(['Property ID', 'property_id'], propertyRef);

  if (!updates.length) return false;

  markOutboundSheetRow(companyId, matchKey);

  const data: sheets_v4.Schema$ValueRange[] = updates.map(({ col, value }) => ({
    range: `'${conn.tasksTab}'!${columnLetter(col)}${sheetRowNumber}`,
    values: [[value]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: conn.spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });

  return true;
}

export function schedulePushTaskToCompanySheet(
  companyId: number,
  taskId: number,
  hints?: { assigneeEmails?: string }
) {
  pushTaskToCompanySheet(companyId, taskId, hints).catch((err) =>
    console.warn(`[sheet-push] task ${taskId} for company ${companyId}:`, err?.message || err)
  );
}

export async function saveMasterSheetConfiguration(
  companyId: number,
  input: { sheetUrl: string; propertiesTab: string; tasksTab: string }
) {
  const verified = await verifySpreadsheet(input.sheetUrl);
  const existing = await getCompanySheetConnection(companyId);
  if (existing && existing.spreadsheetId !== verified.spreadsheetId) {
    throw new Error(
      'Your company already has a different Google Sheet connected. Disconnect it first in Settings → Google Sheets.'
    );
  }

  const data = {
    spreadsheetId: verified.spreadsheetId,
    spreadsheetUrl: input.sheetUrl,
    spreadsheetTitle: verified.spreadsheetTitle,
    propertiesTab: input.propertiesTab,
    tasksTab: input.tasksTab,
    propertyIdColumn: null,
    actionColumn: null,
    tasksMapping: null,
    syncEnabled: true,
  };

  if (existing) {
    await prisma.companyGoogleSheet.update({ where: { companyId }, data });
  } else {
    await prisma.companyGoogleSheet.create({ data: { companyId, ...data } });
  }

  return getCompanySheetConnection(companyId);
}
