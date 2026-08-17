import prisma from '@/lib/prisma';

export type StockStatus = 'ok' | 'low' | 'critical' | 'out';

export interface SupplyForecastItem {
  supplyItemId: number;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  status: StockStatus;
  dailyBurnRate: number;
  projectedNeedNext14Days: number;
  daysUntilStockout: number | null;
  suggestedReorderQty: number;
  location: 'warehouse';
}

export interface CompanySupplyForecast {
  generatedAt: string;
  horizonDays: number;
  upcomingTasks: number;
  summary: { ok: number; low: number; critical: number; out: number };
  items: SupplyForecastItem[];
  alerts: Array<{ severity: 'low' | 'medium' | 'high' | 'critical'; message: string; supplyItemId: number }>;
}

export interface PackingListItem {
  supplyItemId: number;
  name: string;
  unit: string;
  bringQuantity: number;
  currentStock: number;
  reason: string;
  inStock: boolean;
}

export interface TaskPackingList {
  taskId: number;
  taskTitle: string;
  propertyAddress: string;
  propertyType: string;
  unitCount: number;
  items: PackingListItem[];
  totalItems: number;
  missingFromStock: number;
}

const HORIZON_DAYS = 14;
const LOOKBACK_DAYS = 30;
const MIN_BURN_DAYS = 7;

const CHECKLIST_SUPPLY_RULES: Array<{
  keywords: string[];
  supplyKeywords: string[];
  baseQty: number;
}> = [
  { keywords: ['bathroom', 'restroom', 'toilet', 'sanitiz'], supplyKeywords: ['bleach', 'disinfect', 'sanitizer', 'bathroom'], baseQty: 1 },
  { keywords: ['floor', 'mop', 'vacuum', 'carpet'], supplyKeywords: ['mop', 'floor', 'vacuum', 'cleaner', 'carpet'], baseQty: 1 },
  { keywords: ['glass', 'window', 'mirror'], supplyKeywords: ['glass', 'window', 'squeegee', 'mirror'], baseQty: 1 },
  { keywords: ['kitchen', 'appliance', 'degreas'], supplyKeywords: ['degreaser', 'kitchen', 'dish', 'surface'], baseQty: 1 },
  { keywords: ['bin', 'waste', 'trash', 'rubbish'], supplyKeywords: ['bag', 'liner', 'trash', 'rubbish'], baseQty: 1 },
  { keywords: ['dusting', 'desk', 'surface'], supplyKeywords: ['cloth', 'duster', 'spray', 'wipe', 'microfiber'], baseQty: 1 },
];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAhead(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function propertySizeMultiplier(propertyType: string, unitCount: number): number {
  const units = Math.max(1, unitCount || 1);
  let mult = units > 1 ? Math.min(units * 0.35 + 0.65, 2.5) : 1;
  const type = (propertyType || '').toLowerCase();
  if (type.includes('commercial') || type.includes('office')) mult *= 1.25;
  if (type.includes('industrial')) mult *= 1.4;
  return Math.round(mult * 100) / 100;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function computeStockStatus(
  currentStock: number,
  minStock: number,
  daysUntilStockout: number | null
): StockStatus {
  if (currentStock <= 0) return 'out';
  if (currentStock <= minStock || (daysUntilStockout != null && daysUntilStockout <= 3)) return 'critical';
  if (currentStock <= Math.ceil(minStock * 1.5) || (daysUntilStockout != null && daysUntilStockout <= 7)) return 'low';
  return 'ok';
}

function matchInventoryByKeywords(
  inventory: Array<{ id: number; name: string; unit: string; currentStock: number }>,
  supplyKeywords: string[]
): Array<{ id: number; name: string; unit: string; currentStock: number }> {
  return inventory.filter((item) => {
    const name = normalizeName(item.name);
    return supplyKeywords.some((kw) => name.includes(kw));
  });
}

function scoreChecklistSupplies(
  checklistTitles: string[],
  inventory: Array<{ id: number; name: string; unit: string; currentStock: number }>,
  sizeMult: number
): Map<number, { qty: number; reason: string }> {
  const result = new Map<number, { qty: number; reason: string }>();
  const combinedChecklist = checklistTitles.join(' ').toLowerCase();

  for (const rule of CHECKLIST_SUPPLY_RULES) {
    if (!rule.keywords.some((kw) => combinedChecklist.includes(kw))) continue;
    const matches = matchInventoryByKeywords(inventory, rule.supplyKeywords);
    for (const item of matches) {
      const qty = Math.max(1, Math.ceil(rule.baseQty * sizeMult));
      const existing = result.get(item.id);
      if (!existing || qty > existing.qty) {
        result.set(item.id, { qty, reason: 'Matched to job checklist' });
      }
    }
  }

  return result;
}

export async function getCompanySupplyForecast(companyId: number): Promise<CompanySupplyForecast> {
  const now = new Date();
  const lookbackStart = daysAgo(LOOKBACK_DAYS);
  const horizonEnd = daysAhead(HORIZON_DAYS);
  const recentTasksStart = daysAgo(HORIZON_DAYS);

  const [items, usages, upcomingTasks, recentCompletedCount] = await Promise.all([
    prisma.supplyItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.supplyUsage.findMany({
      where: {
        createdAt: { gte: lookbackStart },
        supplyItem: { companyId },
      },
      select: { supplyItemId: true, quantity: true, createdAt: true },
    }),
    prisma.task.findMany({
      where: {
        companyId,
        scheduledDate: { gte: now, lte: horizonEnd },
        status: { in: ['DRAFT', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'RESERVED', 'AWAITING'] },
      },
      select: {
        id: true,
        property: { select: { unitCount: true, propertyType: true } },
      },
    }),
    prisma.task.count({
      where: {
        companyId,
        status: { in: ['COMPLETED', 'APPROVED', 'SUBMITTED'] },
        completedAt: { gte: recentTasksStart },
      },
    }),
  ]);

  const usageByItem = new Map<number, number>();
  let earliestUsage: Date | null = null;
  for (const u of usages) {
    usageByItem.set(u.supplyItemId, (usageByItem.get(u.supplyItemId) || 0) + u.quantity);
    if (!earliestUsage || u.createdAt < earliestUsage) earliestUsage = u.createdAt;
  }

  const effectiveDays = Math.max(
    MIN_BURN_DAYS,
    earliestUsage
      ? Math.ceil((now.getTime() - earliestUsage.getTime()) / (24 * 60 * 60 * 1000))
      : MIN_BURN_DAYS
  );

  const upcomingLoad = upcomingTasks.reduce(
    (sum, t) => sum + propertySizeMultiplier(t.property?.propertyType || 'residential', t.property?.unitCount || 1),
    0
  );
  const historicalBaseline = Math.max(recentCompletedCount, 1);
  const loadFactor = upcomingTasks.length > 0 ? Math.max(upcomingLoad / historicalBaseline, 0.75) : 1;

  const forecastItems: SupplyForecastItem[] = items.map((item) => {
    const totalUsed = usageByItem.get(item.id) || 0;
    const dailyBurnRate = totalUsed > 0 ? totalUsed / effectiveDays : 0;
    const projectedNeedNext14Days = Math.ceil(dailyBurnRate * HORIZON_DAYS * loadFactor);
    const daysUntilStockout =
      item.currentStock > 0 && dailyBurnRate > 0
        ? Math.floor(item.currentStock / dailyBurnRate)
        : item.currentStock === 0
          ? 0
          : null;

    const status = computeStockStatus(item.currentStock, item.minStock, daysUntilStockout);
    const deficit = Math.max(projectedNeedNext14Days - item.currentStock, 0);
    const suggestedReorderQty = Math.max(
      item.currentStock <= item.minStock ? item.minStock * 2 - item.currentStock : 0,
      deficit,
      0
    );

    return {
      supplyItemId: item.id,
      name: item.name,
      unit: item.unit,
      currentStock: item.currentStock,
      minStock: item.minStock,
      status,
      dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
      projectedNeedNext14Days,
      daysUntilStockout,
      suggestedReorderQty,
      location: 'warehouse' as const,
    };
  });

  const summary = { ok: 0, low: 0, critical: 0, out: 0 };
  for (const item of forecastItems) summary[item.status] += 1;

  const alerts: CompanySupplyForecast['alerts'] = [];
  for (const item of forecastItems) {
    if (item.status === 'out') {
      alerts.push({
        severity: 'critical',
        supplyItemId: item.supplyItemId,
        message: `${item.name} is out of stock. Reorder immediately.`,
      });
    } else if (item.status === 'critical') {
      alerts.push({
        severity: 'high',
        supplyItemId: item.supplyItemId,
        message: `${item.name} is critically low (${item.currentStock} ${item.unit}).`,
      });
    } else if (item.daysUntilStockout != null && item.daysUntilStockout <= HORIZON_DAYS) {
      alerts.push({
        severity: 'medium',
        supplyItemId: item.supplyItemId,
        message: `${item.name} may run out in ~${item.daysUntilStockout} day(s) at current usage.`,
      });
    }
  }

  return {
    generatedAt: now.toISOString(),
    horizonDays: HORIZON_DAYS,
    upcomingTasks: upcomingTasks.length,
    summary,
    items: forecastItems.sort((a, b) => {
      const order: Record<StockStatus, number> = { out: 0, critical: 1, low: 2, ok: 3 };
      return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
    }),
    alerts,
  };
}

export async function buildPackingListForTask(
  companyId: number,
  taskId: number
): Promise<TaskPackingList | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId },
    include: {
      property: { select: { address: true, propertyType: true, unitCount: true, id: true } },
      checklists: { select: { title: true } },
    },
  });

  if (!task?.property) return null;

  const inventory = await prisma.supplyItem.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, unit: true, currentStock: true, minStock: true },
    orderBy: { name: 'asc' },
  });

  const completedTasks = await prisma.task.findMany({
    where: {
      propertyId: task.property.id,
      companyId,
      status: { in: ['COMPLETED', 'APPROVED', 'SUBMITTED'] },
      id: { not: taskId },
    },
    select: { id: true },
  });

  const completedTaskIds = completedTasks.map((t) => t.id);
  const propertyUsages =
    completedTaskIds.length > 0
      ? await prisma.supplyUsage.findMany({
          where: { taskId: { in: completedTaskIds } },
          select: { supplyItemId: true, quantity: true, taskId: true },
        })
      : [];

  const taskIds = new Set(propertyUsages.map((u) => u.taskId).filter(Boolean));
  const jobCount = Math.max(taskIds.size, 1);
  const avgByItem = new Map<number, number>();
  for (const u of propertyUsages) {
    avgByItem.set(u.supplyItemId, (avgByItem.get(u.supplyItemId) || 0) + u.quantity);
  }

  const sizeMult = propertySizeMultiplier(task.property.propertyType, task.property.unitCount);
  const checklistTitles = task.checklists.map((c) => c.title);
  const checklistMatches = scoreChecklistSupplies(checklistTitles, inventory, sizeMult);

  const merged = new Map<number, { qty: number; reason: string }>();

  for (const [itemId, total] of avgByItem) {
    const avg = Math.max(1, Math.ceil(total / jobCount));
    const scaled = Math.max(1, Math.ceil(avg * sizeMult));
    merged.set(itemId, { qty: scaled, reason: 'Based on past jobs at this property' });
  }

  for (const [itemId, match] of checklistMatches) {
    const existing = merged.get(itemId);
    if (!existing || match.qty > existing.qty) {
      merged.set(itemId, match);
    } else if (existing) {
      merged.set(itemId, { qty: Math.max(existing.qty, match.qty), reason: `${existing.reason}; checklist match` });
    }
  }

  if (merged.size === 0 && inventory.length > 0) {
    const defaults = inventory
      .filter((i) => i.currentStock > 0)
      .slice(0, 5)
      .map((i) => i.id);
    for (const id of defaults) {
      merged.set(id, { qty: 1, reason: 'Standard kit — add usage logs to improve predictions' });
    }
  }

  const items: PackingListItem[] = [];
  for (const [supplyItemId, { qty, reason }] of merged) {
    const inv = inventory.find((i) => i.id === supplyItemId);
    if (!inv) continue;
    const bringQuantity = inv.currentStock > 0 ? Math.min(qty, inv.currentStock) : qty;
    items.push({
      supplyItemId: inv.id,
      name: inv.name,
      unit: inv.unit,
      bringQuantity,
      currentStock: inv.currentStock,
      reason,
      inStock: inv.currentStock >= bringQuantity,
    });
  }

  items.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return {
    taskId: task.id,
    taskTitle: task.title,
    propertyAddress: task.property.address,
    propertyType: task.property.propertyType,
    unitCount: task.property.unitCount,
    items,
    totalItems: items.length,
    missingFromStock: items.filter((i) => !i.inStock).length,
  };
}
